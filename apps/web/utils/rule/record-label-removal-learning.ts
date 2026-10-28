import { subMinutes } from "date-fns/subMinutes";
import {
  ClassificationFeedbackEventType,
  GroupItemSource,
  type SystemType,
} from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { shouldLearnFromLabelRemoval } from "@/utils/rule/consts";
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
  threadId?: string | null;
  emailAccountId: string;
  isBulkRemoval?: boolean;
  logger: Logger;
}) {
  if (!sender) {
    logger.info("No sender found, skipping learning");
    return;
  }

  if (ruleId && !systemType) {
    // A custom rule's label can be removed as part of a normal workflow, so this
    // isn't strong enough to exclude the sender. It does contradict an AI-inferred
    // sender pattern, which would otherwise keep reapplying the label.
    const removedCount = await removeAiLearnedPattern({
      emailAccountId,
      from: sender,
      ruleId,
    });
    logger.info("Processed custom rule label removal", { removedCount });
    return;
  }

  if (!ruleId || !systemType || !shouldLearnFromLabelRemoval(systemType)) {
    logger.info("Label removal does not match a learnable system rule", {
      systemType,
    });
    return;
  }

  if (isBulkRemoval) {
    logger.info("Skipping learning from bulk label removal", { systemType });
    return;
  }

  // Gmail callers record this removal's feedback row first, so the count
  // includes it. Concurrent webhook pages can still race past this check; the
  // batch-level isBulkRemoval flag is the primary guard for large sweeps.
  const recentRemovals = await prisma.classificationFeedback.count({
    where: {
      emailAccountId,
      ruleId,
      eventType: ClassificationFeedbackEventType.LABEL_REMOVED,
      createdAt: {
        gte: subMinutes(new Date(), BULK_LABEL_REMOVAL_WINDOW_MINUTES),
      },
    },
  });

  if (recentRemovals >= BULK_LABEL_REMOVAL_THRESHOLD) {
    logger.info(
      "Skipping learning: recent label removals look like a bulk action",
      {
        systemType,
        recentRemovals,
      },
    );
    return;
  }

  logger.info("Processing label removal for learning", {
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
