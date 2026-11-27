import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import { mapWithConcurrency } from "@/utils/async";
import {
  getPendingSnoozeRollbackMessageIds,
  scheduleSnoozedThread,
} from "@/utils/snooze/scheduler";
import { withSnoozeMutationLease } from "@/utils/snooze/mutation-lease";

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
  if (!uniqueThreadIds.length)
    return { failedThreadIds: [], succeededThreadIds: [] };
  const results = await withSnoozeMutationLease(emailAccountId, async () => {
    const pendingRollback =
      await getPendingSnoozeRollbackMessageIds(emailAccountId);
    return mapWithConcurrency(
      uniqueThreadIds,
      SNOOZE_CONCURRENCY,
      async (threadId) => {
        try {
          if (pendingRollback.size) {
            const thread = await provider.getThread(threadId, {
              complete: true,
            });
            if (thread.messages.some(({ id }) => pendingRollback.has(id)))
              return false;
          }
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
  }).catch((error) => {
    logger.error("Failed to start snoozing threads", { error });
    return null;
  });

  const succeededThreadIds = uniqueThreadIds.filter(
    (_, index) => results?.[index],
  );
  const failedThreadIds = uniqueThreadIds.filter(
    (_, index) => !results?.[index],
  );

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
