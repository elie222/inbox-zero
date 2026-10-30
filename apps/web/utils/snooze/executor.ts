import { SnoozedThreadStatus } from "@/generated/prisma/enums";
import type { SnoozedThread } from "@/generated/prisma/client";
import { isThreadNotFoundError } from "@/utils/email/thread-not-found";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { releaseSnoozedThreadForRetry } from "@/utils/snooze/scheduler";

export async function executeSnoozedThread(
  snoozedThread: SnoozedThread,
  provider: EmailProvider,
  logger: Logger,
  leaseStartedAt: Date,
) {
  try {
    await provider.unarchiveThread(snoozedThread.threadId);
  } catch (error) {
    // A deleted thread can never be restored, so retrying would loop forever.
    if (isThreadNotFoundError(error)) {
      await prisma.snoozedThread.updateMany({
        where: {
          id: snoozedThread.id,
          status: SnoozedThreadStatus.EXECUTING,
          updatedAt: leaseStartedAt,
        },
        data: { status: SnoozedThreadStatus.CANCELLED },
      });
      logger.warn("Cancelled snooze for a thread that no longer exists", {
        snoozedThreadId: snoozedThread.id,
      });
      return { success: true as const };
    }

    await releaseSnoozedThreadForRetry(snoozedThread.id, leaseStartedAt);
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
        status: SnoozedThreadStatus.EXECUTING,
        updatedAt: leaseStartedAt,
      },
      data: { status: SnoozedThreadStatus.COMPLETED },
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
