import { SnoozedThreadStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { createEmailProvider } from "@/utils/email/provider";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { mapWithConcurrency } from "@/utils/async";
import { executeSnoozedThread } from "@/utils/snooze/executor";
import {
  markSnoozedThreadAsExecuting,
  releaseSnoozedThreadForRetry,
  SNOOZE_EXECUTION_LEASE_MS,
} from "@/utils/snooze/scheduler";

const BATCH_SIZE = 100;
const RESTORE_CONCURRENCY = 10;

type SnoozedThreadWithAccount = Prisma.SnoozedThreadGetPayload<{
  include: { emailAccount: { include: { account: true } } };
}>;

export type SnoozedThreadProcessResult =
  | { status: "processed" }
  | { status: "skipped" }
  | { status: "failed"; reason: "missing-provider" | "restore" };

export async function processDueSnoozedThreads(logger: Logger) {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - SNOOZE_EXECUTION_LEASE_MS);
  const snoozedThreads = await prisma.snoozedThread.findMany({
    where: {
      scheduledFor: { lte: now },
      OR: [
        { status: SnoozedThreadStatus.PENDING },
        {
          status: SnoozedThreadStatus.EXECUTING,
          updatedAt: { lte: staleBefore },
        },
      ],
    },
    orderBy: { scheduledFor: "asc" },
    take: BATCH_SIZE,
    include: {
      emailAccount: { include: { account: true } },
    },
  });

  const results = await mapWithConcurrency(
    snoozedThreads,
    RESTORE_CONCURRENCY,
    async (snoozedThread) => {
      try {
        return await processSnoozedThread(snoozedThread, logger);
      } catch (error) {
        logger.error("Failed to process snoozed thread", {
          error,
          snoozedThreadId: snoozedThread.id,
        });
        return { status: "failed", reason: "restore" } as const;
      }
    },
  );

  return {
    processed: results.filter((result) => result.status === "processed").length,
    failed: results.filter((result) => result.status === "failed").length,
    skipped: results.filter((result) => result.status === "skipped").length,
    total: snoozedThreads.length,
  };
}

export async function processSnoozedThread(
  snoozedThread: SnoozedThreadWithAccount,
  logger: Logger,
): Promise<SnoozedThreadProcessResult> {
  const itemLogger = logger.with({
    emailAccountId: snoozedThread.emailAccountId,
    snoozedThreadId: snoozedThread.id,
  });
  const providerType = snoozedThread.emailAccount?.account?.provider;

  if (!providerType) {
    await prisma.snoozedThread.update({
      where: { id: snoozedThread.id },
      data: { status: SnoozedThreadStatus.FAILED },
    });
    return { status: "failed", reason: "missing-provider" };
  }

  const executionToken = await markSnoozedThreadAsExecuting(snoozedThread.id);
  if (!executionToken) {
    return { status: "skipped" };
  }

  try {
    const provider = await createEmailProvider({
      emailAccountId: snoozedThread.emailAccountId,
      provider: providerType,
      logger: itemLogger,
    });
    const result = await executeSnoozedThread(
      snoozedThread,
      provider,
      itemLogger,
      executionToken,
    );
    return result.success
      ? { status: "processed" }
      : { status: "failed", reason: "restore" };
  } catch (error) {
    await releaseSnoozedThreadForRetry(snoozedThread.id, executionToken);
    itemLogger.error("Failed to process snoozed thread", { error });
    return { status: "failed", reason: "restore" };
  }
}
