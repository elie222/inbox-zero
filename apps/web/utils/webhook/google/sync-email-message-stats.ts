import "server-only";

import type { EmailProvider } from "@/utils/email/types";
import { GmailLabel } from "@/utils/gmail/label";
import { isGmailMessageNotFoundError } from "@/utils/gmail/errors";
import type { Logger } from "@/utils/logger";
import {
  deleteEmailMessageStats,
  reconcileEmailMessageStatsFromParsedMessage,
} from "@/utils/email/email-message-stats";
import type { ParsedMessage } from "@/utils/types";

const STATS_RELEVANT_LABELS = new Set<string>([
  GmailLabel.INBOX,
  GmailLabel.UNREAD,
  GmailLabel.SENT,
  GmailLabel.TRASH,
  GmailLabel.SPAM,
  GmailLabel.DRAFT,
]);

export function shouldReconcileStatsForLabelEvent(labelIds?: string[] | null) {
  return !!labelIds?.some((labelId) => STATS_RELEVANT_LABELS.has(labelId));
}

export async function reconcileStatsForDeletedMessage({
  emailAccountId,
  messageId,
  threadId,
  logger,
}: {
  emailAccountId: string;
  messageId: string;
  threadId?: string | null;
  logger: Logger;
}) {
  await deleteEmailMessageStats({
    emailAccountId,
    messageId,
    threadId,
    reason: "gmail-message-deleted",
    logger,
  });
}

export async function reconcileStatsForCurrentGmailMessage({
  emailAccountId,
  messageId,
  threadId,
  provider,
  logger,
  reason,
}: {
  emailAccountId: string;
  messageId: string;
  threadId?: string | null;
  provider: EmailProvider;
  logger: Logger;
  reason: string;
}): Promise<ParsedMessage | null> {
  try {
    const message = await provider.getMessage(messageId);
    const keptInStats = await reconcileEmailMessageStatsFromParsedMessage({
      emailAccountId,
      message,
      logger,
      reason,
    });

    return keptInStats ? message : null;
  } catch (error) {
    if (!isGmailMessageNotFoundError(error)) throw error;

    await deleteEmailMessageStats({
      emailAccountId,
      messageId,
      threadId,
      reason: `${reason}-message-not-found`,
      logger,
    });

    return null;
  }
}
