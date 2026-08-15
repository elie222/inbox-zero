import { SnoozedThreadStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { createEmailProvider } from "@/utils/email/provider";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { executeSnoozedThread } from "@/utils/snooze/executor";
import { markSnoozedThreadAsExecuting } from "@/utils/snooze/scheduler";

const BATCH_SIZE = 100;

type SnoozedThreadWithAccount = Prisma.SnoozedThreadGetPayload<{
  include: { emailAccount: { include: { account: true } } };
}>;

export type SnoozedThreadProcessResult =
  | { status: "processed" }
  | { status: "skipped" }
  | { status: "failed"; reason: "missing-provider" | "restore" };

export async function processDueSnoozedThreads(logger: Logger) {
  const snoozedThreads = await prisma.snoozedThread.findMany({
    where: {
      status: SnoozedThreadStatus.PENDING,
      scheduledFor: { lte: new Date() },
    },
    orderBy: { scheduledFor: "asc" },
    take: BATCH_SIZE,
    include: {
      emailAccount: { include: { account: true } },
    },
  });

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const snoozedThread of snoozedThreads) {
    const result = await processSnoozedThread(snoozedThread, logger);
    if (result.status === "processed") processed += 1;
    else if (result.status === "failed") failed += 1;
    else skipped += 1;
  }

  return {
    processed,
    failed,
    skipped,
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

  if (!(await markSnoozedThreadAsExecuting(snoozedThread.id))) {
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
    );
    return result.success
      ? { status: "processed" }
      : { status: "failed", reason: "restore" };
  } catch (error) {
    await prisma.snoozedThread.update({
      where: { id: snoozedThread.id },
      data: { status: SnoozedThreadStatus.FAILED },
    });
    itemLogger.error("Failed to process snoozed thread", { error });
    return { status: "failed", reason: "restore" };
  }
}
