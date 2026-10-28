import { subMinutes } from "date-fns/subMinutes";
import {
  ClassificationFeedbackEventType,
  GroupItemSource,
  type SystemType,
} from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { saveClassificationFeedback } from "@/utils/rule/classification-feedback";
import {
  isEligibleForClassificationFeedback,
  shouldLearnFromLabelRemoval,
} from "@/utils/rule/consts";
import {
  removeAiLearnedPattern,
  saveLearnedPattern,
} from "@/utils/rule/learned-patterns";

// A user stripping a label from many emails at once is "stop labeling this",
// not a per-sender correction. Learning an exclusion from each one leaves
// later emails from those senders matching nothing.
export const BULK_LABEL_REMOVAL_THRESHOLD = 10;
const BULK_LABEL_REMOVAL_WINDOW_MINUTES = 15;

export async function recordLabelRemovalLearning({
  sender,
  ruleId,
  systemType,
  messageId,
  threadId,
  emailAccountId,
  isBulkRemoval,
  logger,
}: {
  sender: string | null;
  ruleId: string | null | undefined;
  systemType: SystemType | null | undefined;
  messageId: string;
  threadId: string;
  emailAccountId: string;
  isBulkRemoval?: boolean;
  logger: Logger;
}) {
  if (!sender) {
    logger.info("No sender found, skipping learning");
    return;
  }

  if (!ruleId || !isEligibleForClassificationFeedback(systemType)) {
    logger.info("Label removal does not match a learnable rule", {
      systemType,
    });
    return;
  }

  if (!systemType) {
    // Removing a custom rule's label contradicts an inferred sender pattern,
    // but is not strong enough to create a sender exclusion.
    const removedCount = await removeAiLearnedPattern({
      emailAccountId,
      from: sender,
      ruleId,
    });
    logger.info("Processed custom rule label removal", { removedCount });
  }

  // Every removal is recorded as feedback so the AI sees it as a hint for the
  // sender's next email. Only a repeat removal becomes a deterministic exclusion.
  await saveClassificationFeedback({
    emailAccountId,
    sender,
    ruleId,
    threadId,
    messageId,
    eventType: ClassificationFeedbackEventType.LABEL_REMOVED,
    logger,
  });

  if (!systemType || !shouldLearnFromLabelRemoval(systemType)) return;

  if (isBulkRemoval) {
    logger.info("Skipping exclusion: bulk label removal", { systemType });
    return;
  }

  const windowStart = subMinutes(new Date(), BULK_LABEL_REMOVAL_WINDOW_MINUTES);

  // Gmail history pages and Outlook change notifications can both split one
  // sweep across many webhook calls, so also look at what was recorded recently.
  const recentRemovals = await prisma.classificationFeedback.count({
    where: {
      emailAccountId,
      ruleId,
      eventType: ClassificationFeedbackEventType.LABEL_REMOVED,
      createdAt: { gte: windowStart },
    },
  });

  if (recentRemovals >= BULK_LABEL_REMOVAL_THRESHOLD) {
    logger.info("Skipping exclusion: recent removals look like a sweep", {
      systemType,
      recentRemovals,
    });
    return;
  }

  const earlierRemoval = await prisma.classificationFeedback.findFirst({
    where: {
      emailAccountId,
      ruleId,
      sender: sender.toLowerCase(),
      eventType: ClassificationFeedbackEventType.LABEL_REMOVED,
      messageId: { not: messageId },
      createdAt: { lt: windowStart },
    },
    select: { id: true },
  });

  if (!earlierRemoval) {
    logger.info("First label removal for sender, recorded as feedback only", {
      systemType,
    });
    return;
  }

  logger.info("Learning sender exclusion from repeated label removal", {
    systemType,
  });
  logger.trace("Label removal sender", { from: sender });

  await saveLearnedPattern({
    emailAccountId,
    from: sender,
    ruleId,
    exclude: true,
    logger,
    messageId,
    threadId,
    reason: "Label removed",
    source: GroupItemSource.LABEL_REMOVED,
  });
}

export function getBulkRemovedLabelIds(
  labelsRemoved: {
    message?: { id?: string | null } | null;
    labelIds?: string[] | null;
  }[],
) {
  const messageIdsByLabel = new Map<string, Set<string>>();

  for (const removal of labelsRemoved) {
    const messageId = removal.message?.id;
    if (!messageId) continue;

    for (const labelId of removal.labelIds || []) {
      const messageIds = messageIdsByLabel.get(labelId) ?? new Set<string>();
      messageIds.add(messageId);
      messageIdsByLabel.set(labelId, messageIds);
    }
  }

  return new Set(
    [...messageIdsByLabel]
      .filter(
        ([, messageIds]) => messageIds.size >= BULK_LABEL_REMOVAL_THRESHOLD,
      )
      .map(([labelId]) => labelId),
  );
}
