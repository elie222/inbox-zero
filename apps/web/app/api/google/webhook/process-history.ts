import uniqBy from "lodash/uniqBy";
import { NextResponse } from "next/server";
import * as Sentry from "@sentry/nextjs";
import { getGmailClientWithRefresh } from "@/utils/gmail/client";
import { GmailLabel } from "@/utils/gmail/label";
import { captureException } from "@/utils/error";
import {
  HistoryEventType,
  type ProcessHistoryOptions,
} from "@/app/api/google/webhook/types";
import { processHistoryItem } from "@/app/api/google/webhook/process-history-item";
import { getHistory } from "@/utils/gmail/history";
import {
  validateWebhookAccount,
  getWebhookEmailAccount,
  type ValidatedWebhookAccountData,
} from "@/utils/webhook/validate-webhook-account";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import type { gmail_v1 } from "@googleapis/gmail";

export async function processHistoryForUser(
  decodedData: {
    emailAddress: string;
    historyId: number;
  },
  options: { startHistoryId?: string },
  logger: Logger,
) {
  const startTime = Date.now();
  const { emailAddress, historyId } = decodedData;
  // All emails in the database are stored in lowercase
  // But it's possible that the email address in the webhook is not
  // So we need to convert it to lowercase
  const email = emailAddress.toLowerCase();

  const emailAccount = await getWebhookEmailAccount({ email }, logger);

  // biome-ignore lint/style/noParameterAssign: allowed for logging
  logger = logger.with({ email, emailAccountId: emailAccount?.id });

  const validation = await validateWebhookAccount(emailAccount, logger);

  if (!validation.success) {
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

  if (
    !validatedEmailAccount.account?.access_token ||
    !validatedEmailAccount.account?.refresh_token
  ) {
    logger.error("Missing tokens after validation");
    return NextResponse.json({ error: true });
  }

  const accountAccessToken = validatedEmailAccount.account.access_token;
  const accountRefreshToken = validatedEmailAccount.account.refresh_token;
  const accountProvider = validatedEmailAccount.account.provider || "google";

  try {
    const gmail = await getGmailClientWithRefresh({
      accessToken: accountAccessToken,
      refreshToken: accountRefreshToken,
      expiresAt: validatedEmailAccount.account.expires_at?.getTime() || null,
      emailAccountId: validatedEmailAccount.id,
      logger,
    });

    const historyResult = await fetchGmailHistoryResilient({
      gmail,
      emailAccount,
      webhookHistoryId: historyId,
      options,
      logger,
    });

    if (historyResult.status === "expired") {
      await updateLastSyncedHistoryId({
        emailAccountId: validatedEmailAccount.id,
        lastSyncedHistoryId: historyId.toString(),
      });
      return NextResponse.json({ ok: true });
    }

    const history = historyResult.data;

    if (history.history) {
      logger.info("Processing history", {
        startHistoryId: historyResult.startHistoryId,
      });

      await processHistory(
        {
          history: history.history,
          gmail,
          accessToken: accountAccessToken,
          hasAutomationRules,
          hasAiAccess: userHasAiAccess,
          rules: validatedEmailAccount.rules,
          emailAccount: {
            ...validatedEmailAccount,
            account: {
              provider: accountProvider,
            },
          },
        },
        logger,
      );
    } else {
      logger.info("No history", {
        startHistoryId: historyResult.startHistoryId,
      });

      // important to save this or we can get into a loop with never receiving history
      await updateLastSyncedHistoryId({
        emailAccountId: validatedEmailAccount.id,
        lastSyncedHistoryId: historyId.toString(),
      });
    }

    const processingTimeMs = Date.now() - startTime;
    logger.info("Completed processing history", { processingTimeMs });

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_grant") {
      logger.warn("Invalid grant", { email });
      return NextResponse.json({ ok: true });
    }

    captureException(error, { userEmail: email, extra: { decodedData } });
    logger.error("Error processing webhook", {
      error:
        error instanceof Error
          ? {
              message: error.message,
              stack: error.stack,
              name: error.name,
            }
          : error,
    });
    // returning 200 here, as otherwise PubSub will call the webhook over and over
    return NextResponse.json({ error: true });
  }
}

async function processHistory(options: ProcessHistoryOptions, logger: Logger) {
  const { history, emailAccount } = options;
  const { email: userEmail, id: emailAccountId } = emailAccount;

  if (!history?.length) return;

  for (const h of history) {
    const historyMessages = [
      ...(h.messagesAdded || []),
      ...(h.labelsAdded || []),
      ...(h.labelsRemoved || []),
    ];

    if (!historyMessages.length) continue;

    const allEvents = [
      ...(h.messagesAdded || [])
        .filter((m) => {
          const isRelevant = isInboxOrSentMessage(m);
          if (!isRelevant) {
            logger.info("Skipping message not in inbox or sent", {
              messageId: m.message?.id,
              labelIds: m.message?.labelIds,
            });
          }
          return isRelevant;
        })
        .map((m) => ({ type: HistoryEventType.MESSAGE_ADDED, item: m })),
      ...(h.labelsAdded || []).map((m) => ({
        type: HistoryEventType.LABEL_ADDED,
        item: m,
      })),
      ...(h.labelsRemoved || []).map((m) => ({
        type: HistoryEventType.LABEL_REMOVED,
        item: m,
      })),
    ];

    const uniqueEvents = uniqBy(
      allEvents,
      (e) => `${e.type}:${e.item.message?.id}`,
    );

    for (const event of uniqueEvents) {
      const log = logger.with({
        messageId: event.item.message?.id,
        threadId: event.item.message?.threadId,
      });

      try {
        await processHistoryItem(event, options, log);
      } catch (error) {
        captureException(error, {
          userEmail,
          extra: { messageId: event.item.message?.id },
        });
        logger.error("Error processing history item", { error });
      }
    }
  }

  const lastSyncedHistoryId = history[history.length - 1].id;

  await updateLastSyncedHistoryId({
    emailAccountId,
    lastSyncedHistoryId,
  });
}

async function updateLastSyncedHistoryId({
  emailAccountId,
  lastSyncedHistoryId,
}: {
  emailAccountId: string;
  lastSyncedHistoryId?: string | null;
}) {
  if (!lastSyncedHistoryId) return;
  await prisma.emailAccount.update({
    where: { id: emailAccountId },
    data: { lastSyncedHistoryId },
  });
}

const isInboxOrSentMessage = (message: {
  message?: { labelIds?: string[] | null };
}) => {
  const labels = message.message?.labelIds;

  if (!labels) return false;

  if (labels.includes(GmailLabel.INBOX) && !labels.includes(GmailLabel.DRAFT))
    return true;

  if (labels.includes(GmailLabel.SENT)) return true;

  return false;
};

function isHistoryIdExpiredError(error: unknown): boolean {
  // biome-ignore lint/suspicious/noExplicitAny: simple
  const err = error as any;
  const statusCode =
    err.response?.data?.error?.code ??
    err.response?.status ??
    err.status ??
    err.code;

  return statusCode === 404;
}

/**
 * Fetches history from Gmail with resilience:
 * 1. Limits how far back we go to avoid processing massive gaps (e.g. if a user is disconnected for months).
 * 2. Handles expired history IDs (404s) by resetting the sync point.
 */
async function fetchGmailHistoryResilient({
  gmail,
  emailAccount,
  webhookHistoryId,
  options,
  logger,
}: {
  gmail: gmail_v1.Gmail;
  emailAccount: ValidatedWebhookAccountData;
  webhookHistoryId: number;
  options: { startHistoryId?: string };
  logger: Logger;
}): Promise<
  | {
      status: "success";
      data: Awaited<ReturnType<typeof getHistory>>;
      startHistoryId: string;
    }
  | { status: "expired" }
> {
  const lastSyncedHistoryId = Number.parseInt(
    emailAccount?.lastSyncedHistoryId || "0",
  );

  // If the gap is too large (e.g. > 500 items), we start from currentHistoryId - 500.
  // This prevents timeouts and runaway processing costs if the system falls way behind.
  const startHistoryIdNum = Math.max(
    lastSyncedHistoryId,
    webhookHistoryId - 500,
  );
  const startHistoryId =
    options?.startHistoryId || startHistoryIdNum.toString();

  // Log if we are intentionally skipping emails to keep the system stable
  if (startHistoryIdNum > lastSyncedHistoryId && !options?.startHistoryId) {
    logger.warn("Skipping history items due to large gap", {
      lastSyncedHistoryId,
      webhookHistoryId,
      effectiveStartHistoryId: startHistoryIdNum,
      skippedHistoryItems: startHistoryIdNum - lastSyncedHistoryId,
    });
  }

  logger.info("Listing history", {
    startHistoryId,
    lastSyncedHistoryId: emailAccount?.lastSyncedHistoryId,
    gmailHistoryId: startHistoryId,
  });

  try {
    const data = await getHistory(gmail, {
      startHistoryId,
      historyTypes: ["messageAdded", "labelAdded", "labelRemoved"],
      maxResults: 500,
    });
    return { status: "success", data, startHistoryId };
  } catch (error) {
    // Gmail history IDs are typically valid for ~1 week. If older, Gmail returns a 404.
    // In this case, we reset the sync point to the current history ID.
    if (isHistoryIdExpiredError(error)) {
      logger.warn("HistoryId expired, resetting to current", {
        expiredHistoryId: startHistoryId,
        newHistoryId: webhookHistoryId,
      });
      return { status: "expired" };
    }
    throw error;
  }
}
