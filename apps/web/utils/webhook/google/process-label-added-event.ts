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
import { fetchSenderFromMessage } from "@/utils/webhook/google/fetch-sender-from-message";
import { isSameEmailAddress, isSameOrganization } from "@/utils/email";
import { internalDateToDate } from "@/utils/date";
import { hasPriorContactOrAssumeYes } from "@/utils/cold-email/has-prior-contact";

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
    spamLearnedThreadIds,
  }: {
    emailAccount: EmailAccountWithAI;
    provider: EmailProvider;
    spamLearnedThreadIds: Set<string>;
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

  // Junking a thread fires one event per message, but spam learning is thread-scoped
  // and the answer is the same for all of them, so only the first event does the work.
  const shouldLearnSpam = hasSpam && !spamLearnedThreadIds.has(threadId);

  if (!shouldLearnSpam && classifiableLabelIds.length === 0) {
    logger.trace("No actionable labels added, skipping", {
      messageId,
      addedLabelIds,
    });
    return;
  }

  if (shouldLearnSpam) spamLearnedThreadIds.add(threadId);

  const sender = await fetchSenderFromMessage(messageId, provider, logger);
  if (!sender) return;

  if (shouldLearnSpam) {
    await learnColdEmailFromSpam({
      sender,
      messageId,
      threadId,
      emailAccount,
      provider,
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
  emailAccount,
  provider,
  logger,
}: {
  sender: string;
  messageId: string;
  threadId: string;
  emailAccount: EmailAccountWithAI;
  provider: EmailProvider;
  logger: Logger;
}) {
  const emailAccountId = emailAccount.id;

  logger.info("SPAM label added, learning cold email pattern", {
    messageId,
    threadId,
  });

  if (isSameOrganization(sender, emailAccount.email)) {
    logger.info("Skipping cold email learning for an internal sender");
    return;
  }

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

  // Left until last: Gmail applies SPAM to every message in a thread, so this runs once
  // per message and each of these steps costs a provider call.
  const threadMessages = await getThreadMessages({
    threadId,
    provider,
    logger,
  });
  if (!threadMessages?.length) return;

  // Junking a conversation is not a claim about everyone who replied in it.
  if (
    !threadMessages.every((m) => isSameEmailAddress(m.headers.from, sender))
  ) {
    logger.info(
      "Skipping cold email learning - junked thread is a conversation",
    );
    return;
  }

  // The check every other pattern writer runs. Junking one message from someone you
  // already correspond with does not make them a cold emailer.
  const junkedMessage = threadMessages.find((m) => m.id === messageId);
  const hasPreviousEmail = await hasPriorContactOrAssumeYes({
    provider,
    from: sender,
    date: junkedMessage && internalDateToDate(junkedMessage.internalDate),
    messageId,
    logger,
  });

  if (hasPreviousEmail) {
    logger.info("Skipping cold email learning - sender is a known contact");
    return;
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

/** Returns null on failure, so an unreadable thread never teaches us a pattern. */
async function getThreadMessages({
  threadId,
  provider,
  logger,
}: {
  threadId: string;
  provider: EmailProvider;
  logger: Logger;
}) {
  return provider.getThreadMessages(threadId).catch((error) => {
    logger.warn("Could not read junked thread", { threadId, error });
    return null;
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
