import type { gmail_v1 } from "@googleapis/gmail";
import {
  ActionType,
  GroupItemSource,
  GroupItemType,
} from "@/generated/prisma/enums";
import { extractEmailAddress } from "@/utils/email";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailProvider } from "@/utils/email/types";
import { GmailLabel } from "@/utils/gmail/label";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { recordLabelRemovalLearning } from "@/utils/rule/record-label-removal-learning";
import {
  isGmailRateLimitExceededError,
  isGmailQuotaExceededError,
  isGmailInsufficientPermissionsError,
} from "@/utils/error";

const SYSTEM_LABELS = [
  GmailLabel.INBOX,
  GmailLabel.SENT,
  GmailLabel.DRAFT,
  GmailLabel.SPAM,
  GmailLabel.TRASH,
  GmailLabel.IMPORTANT,
  GmailLabel.STARRED,
  GmailLabel.UNREAD,
];

export async function handleLabelRemovedEvent(
  message: gmail_v1.Schema$HistoryLabelRemoved,
  {
    emailAccount,
    provider,
  }: {
    emailAccount: EmailAccountWithAI;
    provider: EmailProvider;
  },
  logger: Logger,
) {
  const messageId = message.message?.id;
  const threadId = message.message?.threadId;
  const emailAccountId = emailAccount.id;
  const allRemovedLabelIds = message.labelIds || [];

  if (!messageId || !threadId) {
    logger.error("Skipping label removal - missing messageId or threadId", {
      hasMessage: !!message.message,
      hasLabelIds: allRemovedLabelIds.length > 0,
      labelIds: allRemovedLabelIds,
    });
    return;
  }

  const hasSpamRemoval = allRemovedLabelIds.includes(GmailLabel.SPAM);

  // Filter out system labels - we don't learn from system label removals
  // (e.g., archiving removes INBOX, starring adds/removes STARRED, etc.)
  const removedLabelIds = allRemovedLabelIds.filter(
    (labelId) => !SYSTEM_LABELS.includes(labelId),
  );

  // Nothing to process if no SPAM undo needed and no non-system labels removed
  if (!hasSpamRemoval && removedLabelIds.length === 0) {
    logger.trace("No non-system labels removed, skipping", {
      messageId,
      threadId,
      systemLabelsRemoved: allRemovedLabelIds,
    });
    return;
  }

  if (removedLabelIds.length > 0) {
    logger.info("Processing label removal for learning", {
      labelCount: removedLabelIds.length,
      removedLabels: removedLabelIds,
    });
  }

  // Fetch sender once for both spam undo and label-removal learning
  let sender: string | null = null;

  try {
    const parsedMessage = await provider.getMessage(messageId);
    sender = extractEmailAddress(parsedMessage.headers.from);
  } catch (error) {
    // Message not found - expected when message was deleted
    // Check both direct error and nested error (from retry wrapper)
    const errorObj = error as {
      message?: string;
      error?: { message?: string };
    };
    const errorMessage = errorObj?.message || errorObj?.error?.message;
    if (errorMessage === "Requested entity was not found.") {
      logger.warn("Message not found - may have been deleted or trashed", {
        messageId,
        threadId,
        allRemovedLabels: allRemovedLabelIds,
        nonSystemLabels: removedLabelIds,
      });
      return;
    }

    if (isGmailRateLimitExceededError(error)) {
      logger.warn("Rate limit exceeded", { messageId });
      return;
    }

    if (isGmailQuotaExceededError(error)) {
      logger.warn("Quota exceeded", { messageId });
      return;
    }

    if (isGmailInsufficientPermissionsError(error)) {
      logger.warn("Insufficient permissions to access message", { messageId });
      return;
    }

    // Unexpected errors - return early to prevent further processing
    logger.error("Error getting sender for label removal", {
      messageId,
      error,
    });
    return;
  }

  // When SPAM label is removed (user moves email out of Junk),
  // undo any cold email pattern that was learned from marking as junk.
  // Only removes patterns with source = LABEL_ADDED (preserves AI/USER patterns).
  if (hasSpamRemoval && sender) {
    await undoSpamLearning({ sender, emailAccountId, logger });
  }

  for (const labelId of removedLabelIds) {
    try {
      await learnFromRemovedLabel({
        labelId,
        sender,
        messageId,
        threadId,
        emailAccountId,
        logger,
      });
    } catch (error) {
      logger.error("Error learning from label removal", {
        error,
        labelId,
        removedLabelIds,
      });
    }
  }
}

async function learnFromRemovedLabel({
  labelId,
  sender,
  messageId,
  threadId,
  emailAccountId,
  logger,
}: {
  labelId: string;
  sender: string | null;
  messageId: string;
  threadId: string;
  emailAccountId: string;
  logger: Logger;
}) {
  logger = logger.with({ labelId });

  // Find rule with matching label action
  const rule = await prisma.rule.findFirst({
    where: {
      emailAccountId,
      systemType: { not: null },
      actions: {
        some: {
          labelId: labelId,
          type: ActionType.LABEL,
        },
      },
    },
    select: { id: true, systemType: true },
  });

  await recordLabelRemovalLearning({
    sender,
    ruleId: rule?.id,
    systemType: rule?.systemType,
    messageId,
    threadId,
    emailAccountId,
    logger,
  });
}

/**
 * When the SPAM label is removed (user moves email out of Junk),
 * delete any cold email GroupItem that was created by the LABEL_ADDED handler.
 * Only removes patterns we created — preserves AI and USER patterns.
 */
async function undoSpamLearning({
  sender,
  emailAccountId,
  logger,
}: {
  sender: string;
  emailAccountId: string;
  logger: Logger;
}) {
  const coldEmailRule = await prisma.rule.findFirst({
    where: {
      emailAccountId,
      systemType: "COLD_EMAIL",
      enabled: true,
    },
    select: { id: true, groupId: true },
  });

  if (!coldEmailRule?.groupId) return;

  const deleted = await prisma.groupItem.deleteMany({
    where: {
      groupId: coldEmailRule.groupId,
      type: GroupItemType.FROM,
      value: sender,
      source: GroupItemSource.LABEL_ADDED,
    },
  });

  if (deleted.count > 0) {
    logger.trace("Undid cold email learning from spam removal", {
      sender,
      deletedCount: deleted.count,
    });
  } else {
    logger.trace("No LABEL_ADDED cold email pattern to undo", { sender });
  }
}
