import { SnoozedThreadStatus } from "@/generated/prisma/enums";
import type { SnoozedThread } from "@/generated/prisma/client";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { releaseSnoozedThreadForRetry } from "@/utils/snooze/scheduler";

export async function executeSnoozedThread(
  snoozedThread: SnoozedThread,
  provider: EmailProvider,
  logger: Logger,
  executionToken: string,
) {
  try {
    await provider.unarchiveThread(snoozedThread.threadId);
  } catch (error) {
    await releaseSnoozedThreadForRetry(snoozedThread.id, executionToken);
    logger.error("Failed to restore snoozed thread", {
      error,
      snoozedThreadId: snoozedThread.id,
    });
    return { success: false as const, error };
  }

  try {
    const completed = await prisma.snoozedThread.updateMany({
      where: {
        id: snoozedThread.id,
        executionToken,
        status: SnoozedThreadStatus.EXECUTING,
      },
      data: {
        executionToken: null,
        executedAt: new Date(),
        status: SnoozedThreadStatus.COMPLETED,
      },
    });
    if (completed.count !== 1) {
      throw new Error("Snoozed thread execution claim was lost");
    }
    return { success: true as const };
  } catch (error) {
    // Keep EXECUTING so a quick duplicate cannot repeat the provider call.
    // Stale execution recovery will retry and reconcile this record later.
    logger.error("Restored snoozed thread but failed to record completion", {
      error,
      snoozedThreadId: snoozedThread.id,
    });
    return { success: false as const, error };
  }
}
