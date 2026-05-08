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
