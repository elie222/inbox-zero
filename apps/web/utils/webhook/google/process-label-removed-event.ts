import type { gmail_v1 } from "@googleapis/gmail";
import {
  GroupItemSource,
  GroupItemType,
  ClassificationFeedbackEventType,
  SystemType,
} from "@/generated/prisma/enums";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailProvider } from "@/utils/email/types";
import { GMAIL_SYSTEM_LABELS, GmailLabel } from "@/utils/gmail/label";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { recordLabelRemovalLearning } from "@/utils/rule/record-label-removal-learning";
import {
  isEligibleForClassificationFeedback,
  shouldLearnFromLabelRemoval,
} from "@/utils/rule/consts";
import {
  isLearnFromLabelsEnabled,
  unlearnSenderFromLabel,
} from "@/utils/rule/learn-from-label";
import {
  findRuleByLabelId,
  saveClassificationFeedback,
} from "@/utils/rule/classification-feedback";
import { fetchSenderFromMessage } from "@/utils/webhook/google/fetch-sender-from-message";

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
    (labelId) => !GMAIL_SYSTEM_LABELS.includes(labelId),
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

  const learnFromLabels =
    removedLabelIds.length > 0 &&
    (await isLearnFromLabelsEnabled(emailAccountId));

  // Fetch sender once for both spam undo and label-removal learning
  const sender = await fetchSenderFromMessage(messageId, provider, logger);
  if (!sender) return;

  // When SPAM label is removed (user moves email out of Junk),
  // undo any cold email pattern that was learned from marking as junk.
  // Only removes active spam-learned patterns and preserves explicit exclusions.
  if (hasSpamRemoval) {
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
        learnFromLabels,
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
  learnFromLabels,
  logger,
}: {
  labelId: string;
  sender: string | null;
  messageId: string;
  threadId: string;
  emailAccountId: string;
  learnFromLabels: boolean;
  logger: Logger;
}) {
  logger = logger.with({ labelId });

  const rule = await findRuleByLabelId({ labelId, emailAccountId });

  await recordLabelRemovalLearning({
    sender,
    ruleId: rule?.id,
    systemType: rule?.systemType,
    messageId,
    threadId,
    emailAccountId,
    logger,
  });

  if (rule && sender && isEligibleForClassificationFeedback(rule.systemType)) {
    await saveClassificationFeedback({
      emailAccountId,
      sender,
      ruleId: rule.id,
      threadId,
      messageId,
      eventType: ClassificationFeedbackEventType.LABEL_REMOVED,
      logger,
    });
  }

  // Rules that learn from label removal above are covered; this is the undo
  // for senders trained by "learn from labels" (custom and label-created rules).
  const coveredAbove =
    !!rule?.systemType && shouldLearnFromLabelRemoval(rule.systemType);
  if (learnFromLabels && rule && sender && !coveredAbove) {
    await unlearnSenderFromLabel({
      emailAccountId,
      labelId,
      sender,
      messageId,
      threadId,
      ruleId: rule.id,
      logger,
    });
  }
}

/**
 * When the SPAM label is removed (user moves email out of Junk),
 * delete any cold email GroupItem that was created by the LABEL_ADDED handler.
 * Only removes active patterns we created and preserves explicit exclusions.
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
      systemType: SystemType.COLD_EMAIL,
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
      exclude: false,
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
