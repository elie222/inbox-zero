import { after, NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { processHistoryForUser } from "@/app/api/outlook/webhook/process-history";
import { processOutlookLifecycleNotification } from "@/app/api/outlook/webhook/process-lifecycle";
import type { Logger } from "@/utils/logger";
import { env } from "@/env";
import {
  type OutlookWebhookNotification,
  webhookBodySchema,
} from "@/app/api/outlook/webhook/types";
import { handleWebhookError } from "@/utils/webhook/error-handler";
import { runWithBackgroundLoggerFlush } from "@/utils/logger-flush";
import { getWebhookEmailAccount } from "@/utils/webhook/validate-webhook-account";

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

  // Process notifications asynchronously using after() to avoid Microsoft webhook timeout
  // Microsoft expects a response within 3 seconds
  after(() =>
    runWithBackgroundLoggerFlush({
      logger,
      task: () => processNotificationsAsync(notifications, logger),
      extra: { url: "/api/outlook/webhook" },
    }),
  );

  return NextResponse.json({ ok: true });
});

async function processNotificationsAsync(
  notifications: OutlookWebhookNotification[],
  log: Logger,
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

      await processHistoryForUser({
        subscriptionId,
        resourceData,
        logger,
      });
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
