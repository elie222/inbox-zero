import { subDays } from "date-fns/subDays";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

export type ReasoningRetentionSkippedResult = {
  skipped: true;
  reason: "not-configured";
};

export type ReasoningRetentionResult = {
  skipped: false;
  cutoff: Date;
  executedRules: number;
  documentFilings: number;
};

export type DraftSentTextRetentionResult = {
  cutoff: Date;
  draftSendLogs: number;
};

export type ReasoningRetentionPolicyResult =
  | ReasoningRetentionSkippedResult
  | ReasoningRetentionResult;

export async function enforceConfiguredReasoningRetention({
  days,
  logger,
  now = new Date(),
}: {
  days?: number;
  logger: Logger;
  now?: Date;
}): Promise<ReasoningRetentionPolicyResult> {
  if (days === undefined) {
    logger.info(
      "Skipping reasoning retention policy because it is not configured",
    );
    return { skipped: true, reason: "not-configured" };
  }

  return enforceReasoningRetention({ days, logger, now });
}

export async function enforceReasoningRetention({
  days,
  logger,
  now = new Date(),
}: {
  days: number;
  logger: Logger;
  now?: Date;
}): Promise<ReasoningRetentionResult> {
  if (!Number.isInteger(days) || days < 0) {
    throw new Error("Reasoning retention days must be a non-negative integer");
  }

  const cutoff = subDays(now, days);

  const [executedRules, documentFilings] = await Promise.all([
    prisma.executedRule.updateMany({
      where: {
        createdAt: { lt: cutoff },
        reason: { not: null },
      },
      data: { reason: null },
    }),
    prisma.documentFiling.updateMany({
      where: {
        createdAt: { lt: cutoff },
        reasoning: { not: null },
      },
      data: { reasoning: null },
    }),
  ]);

  const result: ReasoningRetentionResult = {
    skipped: false,
    cutoff,
    executedRules: executedRules.count,
    documentFilings: documentFilings.count,
  };

  logger.info("Applied reasoning retention policy", result);

  return result;
}

export async function enforceDraftSentTextRetention({
  days,
  logger,
  now = new Date(),
}: {
  days: number;
  logger: Logger;
  now?: Date;
}): Promise<DraftSentTextRetentionResult> {
  if (!Number.isInteger(days) || days < 0) {
    throw new Error(
      "Draft sent text retention days must be a non-negative integer",
    );
  }

  const cutoff = subDays(now, days);

  const draftSendLogs = await prisma.draftSendLog.updateMany({
    where: {
      createdAt: { lt: cutoff },
      OR: [{ sentText: { not: null } }, { replyMemorySentText: { not: null } }],
    },
    data: {
      sentText: null,
      replyMemorySentText: null,
    },
  });

  const result: DraftSentTextRetentionResult = {
    cutoff,
    draftSendLogs: draftSendLogs.count,
  };

  logger.info("Applied draft sent text retention policy", result);

  return result;
}
