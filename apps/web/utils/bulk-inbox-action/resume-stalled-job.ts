import { randomUUID } from "node:crypto";
import type { BulkInboxActionJobStatus } from "@/generated/prisma/enums";
import { enqueueBulkInboxActionChunk } from "@/utils/bulk-inbox-action/enqueue";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

// Longer than a chunk's lease plus its hand-off, so only a job whose chunk
// died, or whose next chunk was never delivered, looks stalled.
export const BULK_INBOX_ACTION_STALLED_AFTER_MS = 10 * 60 * 1000;
const MAX_RECOVERIES = 3;

/**
 * A chunk that crashes, or a queue that gives up on a delivery, leaves a job
 * running with nothing to continue it. Whoever reads a running job (the card
 * polls it, chat loads it for context, a cron sweeps it) calls this, so a
 * stalled job resumes, or fails after a few tries instead of looking busy
 * forever.
 */
export async function resumeStalledBulkInboxActionJob({
  job,
  logger,
}: {
  job: {
    id: string;
    status: BulkInboxActionJobStatus;
    chunkToken: string | null;
    leaseExpiresAt: Date | null;
    updatedAt: Date;
    recoveryCount: number;
  };
  logger: Logger;
}) {
  if (job.status !== "RUNNING") return;
  const now = Date.now();
  if (job.leaseExpiresAt && job.leaseExpiresAt.getTime() > now) return;

  // A claimed chunk sets the lease and a clean hand-off clears it. With no
  // lease, the queued chunk has not started yet: the queue may only be
  // behind. Each try then waits twice as long and resends the same token, so
  // a slow queue doesn't fail a healthy job and its delivery keeps its place.
  const neverStarted = !job.leaseExpiresAt;
  const stalledAfter = neverStarted
    ? BULK_INBOX_ACTION_STALLED_AFTER_MS * 2 ** job.recoveryCount
    : BULK_INBOX_ACTION_STALLED_AFTER_MS;
  if (now - job.updatedAt.getTime() < stalledAfter) return;

  // Guarded on what was read, so concurrent readers act on a job only once.
  const unchanged = {
    id: job.id,
    status: "RUNNING" as const,
    chunkToken: job.chunkToken,
    updatedAt: job.updatedAt,
  };

  if (job.recoveryCount >= MAX_RECOVERIES) {
    await prisma.bulkInboxActionJob.updateMany({
      where: unchanged,
      data: {
        status: "FAILED",
        error: "The cleanup stopped responding.",
        completedAt: new Date(),
        leaseExpiresAt: null,
      },
    });
    logger.warn("Failed a bulk inbox action that kept stalling", {
      bulkInboxActionJobId: job.id,
    });
    return;
  }

  // A chunk that started and died may still be redelivered, so it gets a new
  // token to keep that stale delivery from running alongside the new one.
  const chunkToken =
    neverStarted && job.chunkToken ? job.chunkToken : randomUUID();
  const claimed = await prisma.bulkInboxActionJob.updateMany({
    where: unchanged,
    data: {
      chunkToken,
      leaseExpiresAt: null,
      recoveryCount: { increment: 1 },
    },
  });
  if (claimed.count !== 1) return;

  logger.warn("Resuming a stalled bulk inbox action", {
    bulkInboxActionJobId: job.id,
    neverStarted,
  });
  try {
    await enqueueBulkInboxActionChunk({ jobId: job.id, chunkToken, logger });
  } catch (error) {
    // The job looks stalled again after the same wait, and the next read
    // retries, until the recovery limit fails it.
    logger.error("Failed to resume a stalled bulk inbox action", {
      bulkInboxActionJobId: job.id,
      error,
    });
  }
}

/** Recovers stalled jobs nobody is reading, for the periodic cron. */
export async function resumeStalledBulkInboxActionJobs({
  logger,
  limit = 100,
}: {
  logger: Logger;
  limit?: number;
}) {
  const now = new Date();
  const jobs = await prisma.bulkInboxActionJob.findMany({
    where: {
      status: "RUNNING",
      updatedAt: {
        lt: new Date(now.getTime() - BULK_INBOX_ACTION_STALLED_AFTER_MS),
      },
      OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lt: now } }],
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
    select: {
      id: true,
      status: true,
      chunkToken: true,
      leaseExpiresAt: true,
      updatedAt: true,
      recoveryCount: true,
    },
  });

  for (const job of jobs) {
    try {
      await resumeStalledBulkInboxActionJob({ job, logger });
    } catch (error) {
      logger.error("Failed to check a stalled bulk inbox action", {
        bulkInboxActionJobId: job.id,
        error,
      });
    }
  }

  return { checked: jobs.length };
}
