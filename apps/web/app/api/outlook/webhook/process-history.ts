import { after, NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { captureException, checkCommonErrors } from "@/utils/error";
import { createEmailProvider } from "@/utils/email/provider";
import type { OutlookResourceData } from "@/app/api/outlook/webhook/types";
import { processHistoryItem } from "@/utils/webhook/process-history-item";
import { markMessageAsProcessing } from "@/utils/redis/message-processing";
import {
  validateWebhookAccount,
  getWebhookEmailAccount,
} from "@/utils/webhook/validate-webhook-account";
import type { Logger } from "@/utils/logger";
import { logErrorWithDedupe } from "@/utils/log-error-with-dedupe";
import { learnFromOutlookLabelRemoval } from "@/app/api/outlook/webhook/learn-label-removal";
import prisma from "@/utils/prisma";
import { runWithBackgroundLoggerFlush } from "@/utils/logger-flush";

export async function processHistoryForUser({
  subscriptionId,
  resourceData,
  logger,
}: {
  subscriptionId: string;
  resourceData: OutlookResourceData;
  logger: Logger;
}) {
  const emailAccount = await getWebhookEmailAccount(
    {
      watchEmailsSubscriptionId: subscriptionId,
    },
    logger,
  );

  logger = logger.with({
    email: emailAccount?.email,
    emailAccountId: emailAccount?.id,
  });

  const validation = await validateWebhookAccount(emailAccount, logger);

  if (!validation.success) {
    // Validation function already logs the specific reason for failure
    return validation.response;
  }

  const {
    emailAccount: validatedEmailAccount,
    hasAutomationRules,
    hasAiAccess: userHasAiAccess,
  } = validation.data;

  Sentry.setTag("emailAccountId", validatedEmailAccount.id);
  Sentry.setUser({
    id: validatedEmailAccount.userId,
    email: validatedEmailAccount.email,
  });

  const accountProvider =
    validatedEmailAccount.account?.provider || "microsoft";

  const provider = await createEmailProvider({
    emailAccountId: validatedEmailAccount.id,
    provider: accountProvider,
    logger,
  });

  try {
    // Outlook: Fetch message first to check folder before acquiring lock
    // This allows draft→sent transitions to be processed (draft webhook doesn't hold lock)
    const message = await provider.getMessage(resourceData.id);

    // Skip messages not in inbox or sent items folders (e.g., drafts, trash)
    const isInInbox = message.labelIds?.includes("INBOX") || false;
    const isInSentItems = message.labelIds?.includes("SENT") || false;

    if (!isInInbox && !isInSentItems) {
      logger.info("Skipping message not in inbox or sent items", {
        labelIds: message.labelIds,
        from: message.headers.from,
        to: message.headers.to,
        subject: message.subject,
      });
      return NextResponse.json({ ok: true });
    }

    // Now acquire lock (only for INBOX/SENT messages)
    const isFree = await markMessageAsProcessing({
      userEmail: validatedEmailAccount.email,
      messageId: resourceData.id,
    });
    if (!isFree) {
      logger.info("Skipping. Message already being processed.");
      return NextResponse.json({ ok: true });
    }

    const hasExistingRule = message.threadId
      ? await prisma.executedRule.findFirst({
          where: {
            emailAccountId: validatedEmailAccount.id,
            threadId: message.threadId,
            messageId: message.id,
          },
          select: { id: true },
        })
      : null;

    if (hasExistingRule) {
      after(() =>
        runWithBackgroundLoggerFlush({
          logger,
          task: async () => {
            try {
              await learnFromOutlookLabelRemoval({
                message,
                emailAccountId: validatedEmailAccount.id,
                logger,
              });
            } catch (error) {
              await logErrorWithDedupe({
                logger,
                message: "Error learning from Outlook label removal",
                error,
                context: { messageId: message.id, threadId: message.threadId },
                dedupeKeyParts: {
                  scope: "outlook/webhook",
                  operation: "learn-label-removal",
                  emailAccountId: validatedEmailAccount.id,
                },
              });
            }
          },
          extra: { operation: "learn-outlook-label-removal" },
        }),
      );
      logger.info("Skipping. Rule already exists.");
      return NextResponse.json({ ok: true });
    }

    // Pass pre-fetched message to avoid refetching
    await processHistoryItem(
      { messageId: resourceData.id, message },
      {
        provider,
        emailAccount: {
          ...validatedEmailAccount,
          account: { provider: accountProvider },
        },
        hasAutomationRules,
        hasAiAccess: userHasAiAccess,
        rules: validatedEmailAccount.rules,
        logger,
      },
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message.includes("invalid_grant")) {
      logger.warn("Invalid grant");
      return NextResponse.json({ ok: true });
    }

    const apiError = checkCommonErrors(error, "/api/outlook/webhook", logger);
    if (apiError) {
      return NextResponse.json({ ok: true });
    }

    captureException(error, {
      emailAccountId: validatedEmailAccount.id,
      userEmail: validatedEmailAccount.email,
      extra: { subscriptionId, resourceData },
    });
    await logErrorWithDedupe({
      logger,
      message: "Error processing webhook",
      error,
      context: {
        resourceData,
      },
      dedupeKeyParts: {
        scope: "outlook/webhook",
        emailAccountId: validatedEmailAccount.id,
        operation: "process-history-for-user",
      },
    });
    // returning 200 here, as otherwise Microsoft will keep retrying
    return NextResponse.json({ error: true });
  }
}
