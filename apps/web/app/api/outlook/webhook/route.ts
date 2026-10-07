import { after, NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { processHistoryForUser } from "@/utils/webhook/outlook/process-history";
import { processOutlookLifecycleNotification } from "@/app/api/outlook/webhook/process-lifecycle";
import type { Logger } from "@/utils/logger";
import { env } from "@/env";
import {
  type OutlookWebhookNotification,
  webhookBodySchema,
} from "@/utils/webhook/outlook/types";
import { handleWebhookError } from "@/utils/webhook/error-handler";
import { runWithBackgroundLoggerFlush } from "@/utils/logger-flush";
import {
  cleanupWebhookAccountOnRateLimitSkip,
  getWebhookEmailAccount,
} from "@/utils/webhook/validate-webhook-account";
import { getEmailProviderRateLimitState } from "@/utils/email/rate-limit";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { catchUpAfterOutlookRateLimit } from "@/utils/outlook/rate-limit-catch-up";
import { markOutlookRateLimitCatchUp } from "@/utils/redis/outlook-rate-limit-catch-up";

import { notifyMailboxChanged } from "@/utils/mailbox-push";

export const maxDuration = 300;

export const POST = withError("outlook/webhook", async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const validationToken = searchParams.get("validationToken");

  const logger = request.logger;

  if (validationToken) {
    logger.info("Received validation request", { validationToken });
    return new NextResponse(validationToken, {
      headers: { "Content-Type": "text/plain" },
    });
  }

  const rawBody = await request.json();

  const parseResult = webhookBodySchema.safeParse(rawBody);

  if (!parseResult.success) {
    logger.error("Invalid webhook payload", {
      body: rawBody,
      errors: parseResult.error.issues,
    });
    return NextResponse.json(
      {
        error: "Invalid webhook payload",
        details: parseResult.error.issues,
      },
      { status: 400 },
    );
  }

  const body = parseResult.data;

  // Validate clientState for security (verify webhook is from Microsoft)
  const expectedClientState = env.MICROSOFT_WEBHOOK_CLIENT_STATE;

  if (!expectedClientState) {
    logger.error("MICROSOFT_WEBHOOK_CLIENT_STATE not configured");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 },
    );
  }

  for (const notification of body.value) {
    if (notification.clientState !== expectedClientState) {
      logger.warn("Invalid or missing clientState", {
        subscriptionId: notification.subscriptionId,
      });
      return NextResponse.json(
        { error: "Unauthorized webhook request" },
        { status: 403 },
      );
    }
  }

  logger.info("Received webhook notification - acknowledging immediately", {
    notificationCount: body.value.length,
    subscriptionIds: body.value.map((n) => n.subscriptionId),
  });

  const notifications = body.value;
  const notifiedAccounts = new Set<string>();

  // Process notifications asynchronously using after() to avoid Microsoft webhook timeout
  // Microsoft expects a response within 3 seconds
  after(() =>
    runWithBackgroundLoggerFlush({
      logger,
      task: () =>
        processNotificationsAsync(notifications, logger, notifiedAccounts),
      extra: { url: "/api/outlook/webhook" },
    }),
  );

  return NextResponse.json({ ok: true });
});

async function processNotificationsAsync(
  notifications: OutlookWebhookNotification[],
  log: Logger,
  notifiedAccounts: Set<string>,
) {
  for (const notification of notifications) {
    const { subscriptionId } = notification;
    const logger = log.with({
      subscriptionId,
      ...(notification.resourceData?.id
        ? { messageId: notification.resourceData.id }
        : {}),
    });

    try {
      if (notification.lifecycleEvent) {
        await processOutlookLifecycleNotification({
          notification,
          logger,
        });
        continue;
      }

      if (!notification.resourceData) {
        logger.warn("Skipping Outlook notification without resource data");
        continue;
      }

      const { resourceData } = notification;

      logger.info("Processing notification", {
        changeType: notification.changeType,
      });

      const emailAccount = await getWebhookEmailAccount(
        { watchEmailsSubscriptionId: subscriptionId },
        logger,
      );
      if (emailAccount && !notifiedAccounts.has(emailAccount.id)) {
        notifiedAccounts.add(emailAccount.id);
        // One notification per account per webhook, without waiting on Apple
        // or delaying later notifications in this batch.
        after(() =>
          notifyMailboxChanged({
            emailAccountId: emailAccount.id,
            logger,
          }),
        );
      }
      if (emailAccount && (await isOutlookRateLimited(emailAccount, logger))) {
        continue;
      }

      await processHistoryForUser({
        preloadedEmailAccount: emailAccount,
        subscriptionId,
        resourceData,
        logger,
      });

      if (emailAccount) {
        after(() => catchUpAfterOutlookRateLimit({ emailAccount, logger }));
      }
    } catch (error) {
      const emailAccount = await getWebhookEmailAccount(
        { watchEmailsSubscriptionId: subscriptionId },
        logger,
      ).catch((error) => {
        logger.error("Error getting email account", { error });
        return null;
      });

      if (emailAccount?.email) {
        await handleWebhookError(error, {
          email: emailAccount.email,
          emailAccountId: emailAccount.id,
          url: "/api/outlook/webhook",
          logger,
        });
      } else {
        logger.error("Error processing notification (no email account found)", {
          error,
        });
      }
    }
  }
}

async function isOutlookRateLimited(
  emailAccount: NonNullable<Awaited<ReturnType<typeof getWebhookEmailAccount>>>,
  logger: Logger,
) {
  const activeRateLimit = await getEmailProviderRateLimitState({
    emailAccountId: emailAccount.id,
    logger,
  });
  if (!isMicrosoftProvider(activeRateLimit?.provider)) return false;

  await markOutlookRateLimitCatchUp({
    emailAccountId: emailAccount.id,
    since: new Date(),
    logger,
  });

  await cleanupWebhookAccountOnRateLimitSkip(emailAccount, logger).catch(
    (error) => {
      logger.warn("Failed to cleanup webhook account during rate-limit skip", {
        error: error instanceof Error ? error.message : error,
      });
    },
  );
  logger.warn("Skipping Outlook notification due to active rate limit", {
    emailAccountId: emailAccount.id,
    retryAt: activeRateLimit.retryAt.toISOString(),
    rateLimitSource: activeRateLimit.source,
  });
  return true;
}
