import { addMinutes } from "date-fns/addMinutes";
import { subMinutes } from "date-fns/subMinutes";
import type { Prisma } from "@/generated/prisma/client";
import {
  ActionType,
  ClassificationFeedbackEventType,
  ExecutedActionStatus,
  ExecutedRuleStatus,
  GroupItemSource,
  GroupItemType,
  type SystemType,
} from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { shouldLearnFromLabelRemoval } from "@/utils/rule/consts";
import {
  BULK_LABEL_REMOVAL_THRESHOLD,
  BULK_LABEL_REMOVAL_WINDOW_MINUTES,
} from "@/utils/rule/record-label-removal-learning";

// Merge time of the change that stopped learning an exclusion from a single
// label removal. Exclusions learned before it may rest on one removal.
export const LEGACY_LABEL_REMOVAL_CUTOFF = new Date("2026-10-28T23:32:41Z");

const BATCH_SIZE = 500;

// Exclusions a user added or edited by hand have another source, or an
// updatedAt after the cutoff, so they never match.
const LEGACY_CANDIDATE_WHERE = {
  source: GroupItemSource.LABEL_REMOVED,
  exclude: true,
  type: GroupItemType.FROM,
  createdAt: { lt: LEGACY_LABEL_REMOVAL_CUTOFF },
  updatedAt: { lt: LEGACY_LABEL_REMOVAL_CUTOFF },
} satisfies Prisma.GroupItemWhereInput;

type Removal = {
  sender: string;
  messageId: string;
  createdAt: Date;
  // Before attribution used executed runs, Gmail could credit a removal to a
  // rule that never labelled the message. Only attributed removals prove one.
  attributed: boolean;
};

export async function cleanupLegacyLabelRemovalExclusions({
  apply,
}: {
  apply: boolean;
}) {
  const stats = {
    scanned: 0,
    kept: 0,
    skippedWithoutRule: 0,
    removable: 0,
    removed: 0,
    emailAccounts: 0,
    rules: 0,
  };
  const emailAccountIds = new Set<string>();
  const ruleIds = new Set<string>();
  let cursor: string | undefined;

  while (true) {
    const items = await prisma.groupItem.findMany({
      where: {
        ...LEGACY_CANDIDATE_WHERE,
        ...(cursor ? { id: { gt: cursor } } : {}),
      },
      orderBy: { id: "asc" },
      take: BATCH_SIZE,
      select: {
        id: true,
        value: true,
        group: {
          select: {
            emailAccountId: true,
            rule: { select: { id: true, systemType: true } },
          },
        },
      },
    });
    if (items.length === 0) break;
    cursor = items[items.length - 1].id;
    stats.scanned += items.length;

    const removalsByRule = await getRemovalsByRule(
      items.flatMap((item) => (item.group?.rule ? [item.group.rule.id] : [])),
    );

    const removableIds: string[] = [];
    for (const item of items) {
      const group = item.group;
      const rule = group?.rule;
      if (!group || !rule) {
        stats.skippedWithoutRule += 1;
        continue;
      }

      if (
        canLearnExclusion(rule.systemType) &&
        wouldLearnExclusionToday({
          sender: item.value,
          ruleRemovals: removalsByRule.get(rule.id) ?? [],
        })
      ) {
        stats.kept += 1;
        continue;
      }

      removableIds.push(item.id);
      emailAccountIds.add(group.emailAccountId);
      ruleIds.add(rule.id);
    }

    stats.removable += removableIds.length;

    if (apply && removableIds.length > 0) {
      const deleted = await prisma.groupItem.deleteMany({
        where: { ...LEGACY_CANDIDATE_WHERE, id: { in: removableIds } },
      });
      stats.removed += deleted.count;
    }
  }

  stats.emailAccounts = emailAccountIds.size;
  stats.rules = ruleIds.size;
  return stats;
}

// Replays recordLabelRemovalLearning: an exclusion needs a removal of another
// message from the same sender before the 15-minute window of a later removal
// that was not part of a sweep. Feedback does not record whether a removal was
// in a bulk batch, and concurrent handlers can see rows inserted just after
// theirs, so sweep rows are counted on both sides of the later removal.
export function wouldLearnExclusionToday({
  sender,
  ruleRemovals,
}: {
  sender: string;
  ruleRemovals: Removal[];
}) {
  const normalizedSender = sender.toLowerCase();
  const senderRemovals = ruleRemovals.filter(
    (removal) => removal.attributed && removal.sender === normalizedSender,
  );

  return senderRemovals.some((later) => {
    const windowStart = subMinutes(
      later.createdAt,
      BULK_LABEL_REMOVAL_WINDOW_MINUTES,
    );

    const windowEnd = addMinutes(
      later.createdAt,
      BULK_LABEL_REMOVAL_WINDOW_MINUTES,
    );
    const nearbyRemovals = ruleRemovals.filter(
      (removal) =>
        removal.createdAt >= windowStart && removal.createdAt <= windowEnd,
    ).length;
    if (nearbyRemovals >= BULK_LABEL_REMOVAL_THRESHOLD) return false;

    return senderRemovals.some(
      (earlier) =>
        earlier.messageId !== later.messageId &&
        earlier.createdAt < windowStart,
    );
  });
}

function canLearnExclusion(systemType: SystemType | null) {
  return !!systemType && shouldLearnFromLabelRemoval(systemType);
}

async function getRemovalsByRule(ruleIds: string[]) {
  const removalsByRule = new Map<string, Removal[]>();
  if (ruleIds.length === 0) return removalsByRule;
  const uniqueRuleIds = [...new Set(ruleIds)];

  const feedback = await prisma.classificationFeedback.findMany({
    where: {
      ruleId: { in: uniqueRuleIds },
      eventType: ClassificationFeedbackEventType.LABEL_REMOVED,
    },
    select: { ruleId: true, sender: true, messageId: true, createdAt: true },
  });
  if (feedback.length === 0) return removalsByRule;

  const labelledRuns = await prisma.executedRule.findMany({
    where: {
      ruleId: { in: uniqueRuleIds },
      messageId: { in: [...new Set(feedback.map((f) => f.messageId))] },
      OR: [
        {
          status: ExecutedRuleStatus.APPLIED,
          actionItems: { some: { type: ActionType.LABEL } },
        },
        {
          status: ExecutedRuleStatus.ERROR,
          actionItems: {
            some: {
              type: ActionType.LABEL,
              executionStatus: ExecutedActionStatus.SUCCEEDED,
            },
          },
        },
      ],
    },
    select: { ruleId: true, messageId: true },
  });
  const labelledMessages = new Set(
    labelledRuns.map((run) => `${run.ruleId}:${run.messageId}`),
  );

  for (const { ruleId, ...removal } of feedback) {
    const removals = removalsByRule.get(ruleId) ?? [];
    removals.push({
      ...removal,
      attributed: labelledMessages.has(`${ruleId}:${removal.messageId}`),
    });
    removalsByRule.set(ruleId, removals);
  }

  return removalsByRule;
}
