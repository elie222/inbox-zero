import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import { mapWithConcurrency } from "@/utils/async";
import { scheduleSnoozedThread } from "@/utils/snooze/scheduler";

const SNOOZE_CONCURRENCY = 10;

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
  const uniqueThreadIds = [...new Set(threadIds)];
  const results = await mapWithConcurrency(
    uniqueThreadIds,
    SNOOZE_CONCURRENCY,
    async (threadId) => {
      try {
        await snoozeThread({
          emailAccountId,
          ownerEmail,
          provider,
          snoozedUntil,
          threadId,
        });
        return true;
      } catch (error) {
        logger.error("Failed to snooze thread", { error, threadId });
        return false;
      }
    },
  );

  const succeededThreadIds = uniqueThreadIds.filter(
    (_, index) => results[index],
  );
  const failedThreadIds = uniqueThreadIds.filter((_, index) => !results[index]);

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
  await scheduleSnoozedThread({
    emailAccountId,
    scheduledFor: snoozedUntil,
    threadId,
  });
  await provider.archiveThreadWithLabel(threadId, ownerEmail);
}
