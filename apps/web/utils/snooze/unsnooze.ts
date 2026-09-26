import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { SnoozedThreadStatus } from "@/generated/prisma/enums";
import { cancelSnoozedThreads } from "@/utils/snooze/scheduler";

const ACTIVE_SNOOZE_STATUSES = [
  SnoozedThreadStatus.PREPARING,
  SnoozedThreadStatus.PENDING,
  SnoozedThreadStatus.EXECUTING,
];

export async function unsnoozeThreads({
  emailAccountId,
  logger,
  provider,
  threadIds,
}: {
  emailAccountId: string;
  logger: Logger;
  provider: EmailProvider;
  threadIds: string[];
}) {
  const active = await prisma.snoozedThread.findMany({
    where: {
      emailAccountId,
      threadId: { in: threadIds },
      status: { in: ACTIVE_SNOOZE_STATUSES },
    },
    select: { threadId: true },
  });
  const uniqueThreadIds = [...new Set(active.map((row) => row.threadId))];
  const unsnoozedThreadIds: string[] = [];

  for (const threadId of uniqueThreadIds) {
    try {
      await provider.unarchiveThread(threadId);
      unsnoozedThreadIds.push(threadId);
    } catch (error) {
      logger.error("Failed to unsnooze thread", { error, threadId });
    }
  }

  if (unsnoozedThreadIds.length > 0) {
    await cancelSnoozedThreads({
      emailAccountId,
      threadIds: unsnoozedThreadIds,
    });
  }

  return { unsnoozedThreadIds };
}
