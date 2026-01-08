import { subDays } from "date-fns/subDays";
import prisma from "@/utils/prisma";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import { removeFollowUpLabel, hasFollowUpLabel } from "./labels";

const STALE_DRAFT_DAYS = 7;

/**
 * Cleans up stale follow-up drafts (older than 7 days) for an account.
 * This runs as part of the daily cron job.
 */
export async function cleanupStaleDrafts({
  emailAccountId,
  provider,
  logger,
}: {
  emailAccountId: string;
  provider: EmailProvider;
  logger: Logger;
}): Promise<void> {
  const staleThreshold = subDays(new Date(), STALE_DRAFT_DAYS);

  logger.info("Cleaning up stale follow-up drafts", {
    thresholdDays: STALE_DRAFT_DAYS,
    before: staleThreshold.toISOString(),
  });

  // Find trackers with follow-up applied more than 7 days ago that are still unresolved
  const staleTrackers = await prisma.threadTracker.findMany({
    where: {
      emailAccountId,
      followUpAppliedAt: { lt: staleThreshold },
      resolved: false,
    },
    select: {
      id: true,
      threadId: true,
      followUpAppliedAt: true,
    },
  });

  logger.info("Found stale trackers", { count: staleTrackers.length });

  // Fetch drafts once for the entire cleanup operation to avoid N+1 API calls
  const allDrafts =
    staleTrackers.length > 0
      ? await provider.getDrafts({ maxResults: 100 })
      : [];

  for (const tracker of staleTrackers) {
    const trackerLogger = logger.with({
      trackerId: tracker.id,
      threadId: tracker.threadId,
    });

    try {
      // Check if thread still has follow-up label
      const hasLabel = await hasFollowUpLabel({
        provider,
        threadId: tracker.threadId,
      });

      if (!hasLabel) {
        trackerLogger.info("Thread no longer has follow-up label, skipping");
        continue;
      }

      // Filter drafts for this thread
      const threadDrafts = allDrafts.filter(
        (draft) => draft.threadId === tracker.threadId,
      );

      for (const draft of threadDrafts) {
        try {
          await provider.deleteDraft(draft.id);
          trackerLogger.info("Deleted stale draft", { draftId: draft.id });
        } catch (error) {
          trackerLogger.warn("Failed to delete stale draft", {
            draftId: draft.id,
            error,
          });
        }
      }

      trackerLogger.info("Cleaned up stale drafts for thread", {
        deletedCount: threadDrafts.length,
      });
    } catch (error) {
      trackerLogger.error("Failed to cleanup stale drafts for thread", {
        error,
      });
    }
  }

  logger.info("Finished cleaning up stale drafts");
}

/**
 * Removes follow-up label from a thread if present.
 * Called when a reply is detected (inbound or outbound).
 */
export async function clearFollowUpLabel({
  emailAccountId,
  threadId,
  provider,
  logger,
}: {
  emailAccountId: string;
  threadId: string;
  provider: EmailProvider;
  logger: Logger;
}): Promise<void> {
  logger.info("Checking for follow-up label to remove", { threadId });

  try {
    const hasLabel = await hasFollowUpLabel({ provider, threadId });

    if (!hasLabel) {
      logger.info("Thread does not have follow-up label", { threadId });
      return;
    }

    // Remove the follow-up label
    await removeFollowUpLabel({ provider, threadId });

    // Clear followUpAppliedAt on the tracker so it can be re-triggered if needed
    await prisma.threadTracker.updateMany({
      where: {
        emailAccountId,
        threadId,
        resolved: false,
      },
      data: {
        followUpAppliedAt: null,
      },
    });

    logger.info("Removed follow-up label and cleared tracker", { threadId });
  } catch (error) {
    logger.error("Failed to remove follow-up label", { threadId, error });
  }
}
