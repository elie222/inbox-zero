import uniqBy from "lodash/uniqBy";
import { NextResponse } from "next/server";
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
} from "@/utils/webhook/validate-webhook-account";
import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";

export async function processHistoryForUser(
  decodedData: {
    emailAddress: string;
    historyId: number;
  },
  options: { startHistoryId?: string },
  logger: Logger,
) {
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
    });

    const startHistoryId =
      options?.startHistoryId ||
      Math.max(
        Number.parseInt(emailAccount?.lastSyncedHistoryId || "0"),
        historyId - 500, // avoid going too far back
      ).toString();

    logger.info("Listing history", {
      startHistoryId,
      lastSyncedHistoryId: emailAccount?.lastSyncedHistoryId,
      gmailHistoryId: startHistoryId,
    });

    const history = await getHistory(gmail, {
      // NOTE this can cause problems if we're way behind
      // NOTE this doesn't include startHistoryId in the results
      startHistoryId,
      historyTypes: ["messageAdded", "labelAdded", "labelRemoved"],
      maxResults: 500,
    });

    if (history.history) {
      logger.info("Processing history", { startHistoryId });

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
      logger.info("No history", { startHistoryId });

      // important to save this or we can get into a loop with never receiving history
      await updateLastSyncedHistoryId({
        emailAccountId: validatedEmailAccount.id,
        lastSyncedHistoryId: historyId.toString(),
      });
    }

    logger.info("Completed processing history");

    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Error && error.message === "invalid_grant") {
      logger.warn("Invalid grant", { email });
      return NextResponse.json({ ok: true });
    }

    captureException(error, { extra: { decodedData } }, email);
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
        .filter(isInboxOrSentMessage)
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
        captureException(
          error,
          { extra: { userEmail, messageId: event.item.message?.id } },
          userEmail,
        );
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
