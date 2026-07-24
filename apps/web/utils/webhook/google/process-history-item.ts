import type { gmail_v1 } from "@googleapis/gmail";
import type { ProcessHistoryOptions } from "@/utils/webhook/google/types";
import { HistoryEventType } from "@/utils/webhook/google/types";
import { createEmailProvider } from "@/utils/email/provider";
import { handleLabelRemovedEvent } from "@/utils/webhook/google/process-label-removed-event";
import { handleLabelAddedEvent } from "@/utils/webhook/google/process-label-added-event";
import { processHistoryItem as processHistoryItemShared } from "@/utils/webhook/process-history-item";
import { markMessageAsProcessing } from "@/utils/redis/message-processing";
import { GmailLabel } from "@/utils/gmail/label";
import type { Logger } from "@/utils/logger";
import {
  reconcileStatsForCurrentGmailMessage,
  reconcileStatsForDeletedMessage,
  shouldReconcileStatsForLabelEvent,
} from "@/utils/webhook/google/sync-email-message-stats";

type GmailHistoryItem =
  | gmail_v1.Schema$HistoryMessageAdded
  | gmail_v1.Schema$HistoryMessageDeleted
  | gmail_v1.Schema$HistoryLabelAdded
  | gmail_v1.Schema$HistoryLabelRemoved;

export async function processHistoryItem(
  historyItem: {
    type: HistoryEventType;
    item: GmailHistoryItem;
  },
  options: ProcessHistoryOptions,
  logger: Logger,
) {
  const { emailAccount, hasAutomationRules, hasAiAccess, rules } = options;
  const { type, item } = historyItem;
  const messageId = item.message?.id;
  const threadId = item.message?.threadId;
  const emailAccountId = emailAccount.id;

  if (!messageId) return;

  logger.info("Gmail history item received", {
    eventType: type,
    labelIds: "labelIds" in item ? item.labelIds : undefined,
  });

  if (type === HistoryEventType.MESSAGE_DELETED) {
    await reconcileStatsForDeletedMessage({
      emailAccountId,
      messageId,
      threadId,
      logger,
    });
    return;
  }

  if (!threadId) return;

  const provider = await createEmailProvider({
    emailAccountId,
    provider: "google",
    logger,
  });

  const reconcileCurrentMessage = async (reason: string) =>
    reconcileStatsForCurrentGmailMessage({
      emailAccountId,
      messageId,
      threadId,
      provider,
      logger,
      reason,
    });

  const lockAndProcessShared = async (reason: string) => {
    const isFree = await markMessageAsProcessing({
      userEmail: emailAccount.email,
      messageId,
    });
    if (!isFree) {
      logger.info("Skipping. Message already being processed.");
      return;
    }

    const message = await reconcileCurrentMessage(reason);
    if (!message) return;

    logger.info("Gmail lock acquired, calling shared processor");

    return processHistoryItemShared(
      { messageId, threadId, message },
      {
        provider,
        emailAccount,
        hasAutomationRules,
        hasAiAccess,
        rules,
        logger,
      },
    );
  };

  // Handle Google-specific label events
  if (type === HistoryEventType.LABEL_REMOVED) {
    const labelRemovedItem = item as gmail_v1.Schema$HistoryLabelRemoved;

    if (shouldReconcileStatsForLabelEvent(labelRemovedItem.labelIds)) {
      await reconcileCurrentMessage("gmail-label-removed");
    }

    logger.info("Processing label removed event for learning");
    return handleLabelRemovedEvent(
      labelRemovedItem,
      {
        emailAccount,
        provider,
      },
      logger,
    );
  } else if (type === HistoryEventType.LABEL_ADDED) {
    const labelAddedItem = item as gmail_v1.Schema$HistoryLabelAdded;

    if (labelAddedItem.labelIds?.includes(GmailLabel.SENT)) {
      return lockAndProcessShared("gmail-sent-label-added");
    }

    if (shouldReconcileStatsForLabelEvent(labelAddedItem.labelIds)) {
      await reconcileCurrentMessage("gmail-label-added");
    }

    logger.info("Processing label added event for learning");
    return handleLabelAddedEvent(
      labelAddedItem,
      {
        emailAccount,
        provider,
      },
      logger,
    );
  }

  return lockAndProcessShared("gmail-message-added");
}
