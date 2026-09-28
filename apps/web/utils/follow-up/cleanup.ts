import { subDays } from "date-fns/subDays";
import prisma from "@/utils/prisma";
import type { EmailProvider } from "@/utils/email/types";
import type { Logger } from "@/utils/logger";
import { hasFollowUpLabel } from "./labels";

const STALE_DRAFT_DAYS = 7;

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
      followUpDraftId: true,
    },
  });

  logger.info("Found stale trackers", { count: staleTrackers.length });

  if (staleTrackers.length === 0) {
    logger.info("Finished cleaning up stale drafts");
    return;
  }

  const trackedDraftIds = new Set(
    staleTrackers.map((t) => t.followUpDraftId).filter(Boolean),
  );

  logger.info("Found tracked drafts in database", {
    count: trackedDraftIds.size,
  });

  const allDrafts = await provider.getDrafts({ maxResults: 100 });

  for (const tracker of staleTrackers) {
    const trackerLogger = logger.with({
      trackerId: tracker.id,
      threadId: tracker.threadId,
    });

    try {
      const hasLabel = await hasFollowUpLabel({
        provider,
        threadId: tracker.threadId,
        logger: trackerLogger,
      });

      if (!hasLabel) {
        trackerLogger.info("Thread no longer has follow-up label, skipping");
        continue;
      }

      // Only delete drafts that are tracked in our database (AI-generated)
      const threadDrafts = allDrafts.filter(
        (draft) => draft.threadId === tracker.threadId,
      );

      const trackedThreadDrafts = threadDrafts.filter((draft) =>
        trackedDraftIds.has(draft.id),
      );

      const skippedCount = threadDrafts.length - trackedThreadDrafts.length;
      if (skippedCount > 0) {
        trackerLogger.info("Skipping untracked drafts (user-created)", {
          skippedCount,
        });
      }

      for (const draft of trackedThreadDrafts) {
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
        deletedCount: trackedThreadDrafts.length,
      });
    } catch (error) {
      trackerLogger.error("Failed to cleanup stale drafts for thread", {
        error,
      });
    }
  }

  logger.info("Finished cleaning up stale drafts");
}
