import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import {
  cancelSnoozedThread,
  scheduleSnoozedThread,
} from "@/utils/snooze/scheduler";

export async function snoozeThreads({
  emailAccountId,
  logger,
  ownerEmail,
  provider,
  snoozedUntil,
  threadIds,
}: {
  emailAccountId: string;
  logger: Logger;
  ownerEmail: string;
  provider: EmailProvider;
  snoozedUntil: Date;
  threadIds: string[];
}) {
  const succeededThreadIds: string[] = [];
  const failedThreadIds: string[] = [];

  for (const threadId of new Set(threadIds)) {
    try {
      await snoozeThread({
        emailAccountId,
        ownerEmail,
        provider,
        snoozedUntil,
        threadId,
      });
      succeededThreadIds.push(threadId);
    } catch (error) {
      logger.error("Failed to snooze thread", { error, threadId });
      failedThreadIds.push(threadId);
    }
  }

  return { failedThreadIds, succeededThreadIds };
}

async function snoozeThread({
  emailAccountId,
  ownerEmail,
  provider,
  snoozedUntil,
  threadId,
}: {
  emailAccountId: string;
  ownerEmail: string;
  provider: EmailProvider;
  snoozedUntil: Date;
  threadId: string;
}) {
  const snoozedThread = await scheduleSnoozedThread({
    emailAccountId,
    scheduledFor: snoozedUntil,
    threadId,
  });

  try {
    await provider.archiveThreadWithLabel(threadId, ownerEmail);
  } catch (error) {
    await cancelSnoozedThread({
      id: snoozedThread.id,
      scheduledId: snoozedThread.scheduledId,
    });
    throw error;
  }
}
