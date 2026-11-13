import type { gmail_v1 } from "@googleapis/gmail";
import {
  ActionType,
  ExecutedActionStatus,
  ExecutedRuleStatus,
  GroupItemSource,
  GroupItemType,
  SystemType,
} from "@/generated/prisma/enums";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailProvider } from "@/utils/email/types";
import { GMAIL_SYSTEM_LABELS, GmailLabel } from "@/utils/gmail/label";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { recordLabelRemovalLearning } from "@/utils/rule/record-label-removal-learning";
import { fetchSenderFromMessage } from "@/utils/webhook/google/fetch-sender-from-message";

export async function handleLabelRemovedEvent(
  message: gmail_v1.Schema$HistoryLabelRemoved,
  {
    emailAccount,
    provider,
    bulkRemovedLabelIds,
  }: {
    emailAccount: EmailAccountWithAI;
    provider: EmailProvider;
    bulkRemovedLabelIds?: Set<string>;
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
        isBulkRemoval: bulkRemovedLabelIds?.has(labelId) ?? false,
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
  isBulkRemoval,
  logger,
}: {
  labelId: string;
  sender: string | null;
  messageId: string;
  threadId: string;
  emailAccountId: string;
  isBulkRemoval: boolean;
  logger: Logger;
}) {
  logger = logger.with({ labelId });

  const rules = await findRulesThatAppliedLabel({
    labelId,
    messageId,
    emailAccountId,
  });

  // A label the user added themselves, or one another rule shares, says
  // nothing about whether this rule was wrong for this message.
  if (rules.length === 0) {
    logger.info("No rule applied the removed label to this message");
    return;
  }

  for (const rule of rules) {
    await recordLabelRemovalLearning({
      sender,
      ruleId: rule.id,
      systemType: rule.systemType,
      messageId,
      threadId,
      emailAccountId,
      isBulkRemoval,
      logger,
    });
  }
}

async function findRulesThatAppliedLabel({
  labelId,
  messageId,
  emailAccountId,
}: {
  labelId: string;
  messageId: string;
  emailAccountId: string;
}) {
  const executedRules = await prisma.executedRule.findMany({
    where: {
      emailAccountId,
      messageId,
      // A run is marked ERROR when any action fails, even after its label
      // was applied, so the label action's own status decides below.
      status: { in: [ExecutedRuleStatus.APPLIED, ExecutedRuleStatus.ERROR] },
      rule: { enabled: true },
      actionItems: { some: { type: ActionType.LABEL } },
    },
    select: {
      rule: {
        select: {
          id: true,
          systemType: true,
          actions: {
            where: { type: ActionType.LABEL, labelId },
            select: { label: true },
          },
        },
      },
      actionItems: {
        where: { type: ActionType.LABEL },
        select: { labelId: true, label: true, executionStatus: true },
      },
    },
  });

  const rules = new Map<
    string,
    { id: string; systemType: SystemType | null }
  >();

  for (const { rule, actionItems } of executedRules) {
    if (!rule) continue;

    // Older executed actions stored only the label name, and a stale label ID
    // can be replaced when labelling, so also match the name this rule now
    // uses for the removed label ID.
    const removedLabelNames = new Set(
      rule.actions.flatMap((action) => (action.label ? [action.label] : [])),
    );

    const appliedRemovedLabel = actionItems.some((action) => {
      if (
        action.executionStatus === ExecutedActionStatus.FAILED ||
        action.executionStatus === ExecutedActionStatus.SKIPPED
      ) {
        return false;
      }
      return (
        action.labelId === labelId ||
        (!!action.label && removedLabelNames.has(action.label))
      );
    });

    if (appliedRemovedLabel) {
      rules.set(rule.id, { id: rule.id, systemType: rule.systemType });
    }
  }

  return [...rules.values()];
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
      value: { equals: sender, mode: "insensitive" },
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
