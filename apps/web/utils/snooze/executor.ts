import { SnoozedThreadStatus } from "@/generated/prisma/enums";
import type { SnoozedThread } from "@/generated/prisma/client";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

export async function executeSnoozedThread(
  snoozedThread: SnoozedThread,
  provider: EmailProvider,
  logger: Logger,
) {
  try {
    await provider.unarchiveThread(snoozedThread.threadId);
    await prisma.snoozedThread.update({
      where: { id: snoozedThread.id },
      data: {
        executedAt: new Date(),
        status: SnoozedThreadStatus.COMPLETED,
      },
    });
    return { success: true as const };
  } catch (error) {
    await prisma.snoozedThread.update({
      where: { id: snoozedThread.id },
      data: { status: SnoozedThreadStatus.FAILED },
    });
    logger.error("Failed to restore snoozed thread", {
      error,
      snoozedThreadId: snoozedThread.id,
    });
    return { success: false as const, error };
  }
}
