import type { gmail_v1 } from "@googleapis/gmail";
import {
  ActionType,
  GroupItemSource,
  GroupItemType,
  ClassificationFeedbackEventType,
  SystemType,
} from "@/generated/prisma/enums";
import { saveLearnedPattern } from "@/utils/rule/learned-patterns";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailProvider } from "@/utils/email/types";
import { GMAIL_SYSTEM_LABELS, GmailLabel } from "@/utils/gmail/label";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { isEligibleForClassificationFeedback } from "@/utils/rule/consts";
import {
  findRuleByLabelId,
  saveClassificationFeedback,
} from "@/utils/rule/classification-feedback";
import { fetchSenderFromMessage } from "@/app/api/google/webhook/fetch-sender-from-message";

/**
 * When labels are added to an email:
 * - SPAM label: learn sender as cold email (existing behavior)
 * - Other labels that map to rules: record as classification feedback
 */
export async function handleLabelAddedEvent(
  message: gmail_v1.Schema$HistoryLabelAdded,
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
  const addedLabelIds = message.labelIds || [];

  if (!messageId || !threadId) {
    logger.error("Skipping label added - missing messageId or threadId");
    return;
  }

  const hasSpam = addedLabelIds.includes(GmailLabel.SPAM);
  const classifiableLabelIds = addedLabelIds.filter(
    (labelId) => !GMAIL_SYSTEM_LABELS.includes(labelId),
  );

  if (!hasSpam && classifiableLabelIds.length === 0) {
    logger.trace("No actionable labels added, skipping", {
      messageId,
      addedLabelIds,
    });
    return;
  }

  const sender = await fetchSenderFromMessage(messageId, provider, logger);
  if (!sender) return;

  if (hasSpam) {
    await learnColdEmailFromSpam({
      sender,
      messageId,
      threadId,
      emailAccountId,
      logger,
    });
  }

  await Promise.all(
    classifiableLabelIds.map((labelId) =>
      recordClassificationFromLabelAdd({
        labelId,
        sender,
        messageId,
        threadId,
        emailAccountId,
        logger,
      }),
    ),
  );
}

async function learnColdEmailFromSpam({
  sender,
  messageId,
  threadId,
  emailAccountId,
  logger,
}: {
  sender: string;
  messageId: string;
  threadId: string;
  emailAccountId: string;
  logger: Logger;
}) {
  logger.info("SPAM label added, learning cold email pattern", {
    messageId,
    threadId,
  });

  const coldEmailRule = await prisma.rule.findFirst({
    where: {
      emailAccountId,
      systemType: SystemType.COLD_EMAIL,
      enabled: true,
    },
    select: { id: true, groupId: true },
  });

  if (!coldEmailRule) {
    logger.info("No Cold Email rule found for account, skipping");
    return;
  }

  // Don't overwrite existing patterns (e.g., AI classification)
  if (coldEmailRule.groupId) {
    const existing = await prisma.groupItem.findUnique({
      where: {
        groupId_type_value: {
          groupId: coldEmailRule.groupId,
          type: GroupItemType.FROM,
          value: sender,
        },
      },
      select: { id: true },
    });

    if (existing) {
      logger.trace("Sender already in cold email group, skipping", {
        sender,
      });
      return;
    }
  }

  logger.trace("Saving cold email learned pattern from SPAM action", {
    sender,
  });

  await saveLearnedPattern({
    emailAccountId,
    from: sender,
    ruleId: coldEmailRule.id,
    exclude: false,
    logger,
    messageId,
    threadId,
    reason: "Marked as spam by user",
    source: GroupItemSource.LABEL_ADDED,
  });
}

async function recordClassificationFromLabelAdd({
  labelId,
  sender,
  messageId,
  threadId,
  emailAccountId,
  logger,
}: {
  labelId: string;
  sender: string;
  messageId: string;
  threadId: string;
  emailAccountId: string;
  logger: Logger;
}) {
  const rule = await findRuleByLabelId({ labelId, emailAccountId });

  if (!rule) return;

  if (!isEligibleForClassificationFeedback(rule.systemType)) return;

  // Self-labeling filter: skip if Inbox Zero already applied this label
  const systemApplied = await wasLabelAppliedBySystem({
    messageId,
    emailAccountId,
    labelId,
  });

  if (systemApplied) {
    logger.trace("Label was applied by system, skipping classification", {
      labelId,
    });
    return;
  }

  await saveClassificationFeedback({
    emailAccountId,
    sender,
    ruleId: rule.id,
    threadId,
    messageId,
    eventType: ClassificationFeedbackEventType.LABEL_ADDED,
    logger,
  });
}

async function wasLabelAppliedBySystem({
  messageId,
  emailAccountId,
  labelId,
}: {
  messageId: string;
  emailAccountId: string;
  labelId: string;
}): Promise<boolean> {
  const executedAction = await prisma.executedAction.findFirst({
    where: {
      labelId,
      type: ActionType.LABEL,
      executedRule: {
        messageId,
        emailAccountId,
      },
    },
    select: { id: true },
  });

  return !!executedAction;
}
