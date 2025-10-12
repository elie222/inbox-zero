import type { gmail_v1 } from "@googleapis/gmail";
import type { ProcessHistoryOptions } from "@/app/api/google/webhook/types";
import { HistoryEventType } from "@/app/api/google/webhook/types";
import { logger as globalLogger } from "@/app/api/google/webhook/logger";
import { createEmailProvider } from "@/utils/email/provider";
import { handleLabelRemovedEvent } from "@/app/api/google/webhook/process-label-removed-event";
import { processHistoryItem as processHistoryItemShared } from "@/utils/webhook/process-history-item";

export async function processHistoryItem(
  historyItem: {
    type: HistoryEventType;
    item:
      | gmail_v1.Schema$HistoryMessageAdded
      | gmail_v1.Schema$HistoryLabelAdded
      | gmail_v1.Schema$HistoryLabelRemoved;
  },
  options: ProcessHistoryOptions,
) {
  const { emailAccount, hasAutomationRules, hasAiAccess, rules } = options;
  const { type, item } = historyItem;
  const messageId = item.message?.id;
  const threadId = item.message?.threadId;

  const emailAccountId = emailAccount.id;
  const userEmail = emailAccount.email;

  if (!messageId || !threadId) return;

  const provider = await createEmailProvider({
    emailAccountId,
    provider: "google",
  });

  const logger = globalLogger.with({
    email: userEmail,
    messageId,
    threadId,
  });

  // Handle Google-specific label events
  if (type === HistoryEventType.LABEL_REMOVED) {
    logger.info("Processing label removed event for learning");
    return handleLabelRemovedEvent(item, {
      emailAccount,
      provider,
    });
  } else if (type === HistoryEventType.LABEL_ADDED) {
    logger.info("Processing label added event for learning");
    return;
  }

  return processHistoryItemShared(
    { messageId, threadId },
    {
      provider,
      emailAccount,
      hasAutomationRules,
      hasAiAccess,
      rules,
      logger,
    },
  );
}
