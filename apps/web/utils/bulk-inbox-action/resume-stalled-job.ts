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
 * polls it, chat loads it for context) calls this, so a stalled job resumes,
 * or fails after a few tries instead of looking busy forever.
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
  if (now - job.updatedAt.getTime() < BULK_INBOX_ACTION_STALLED_AFTER_MS) {
    return;
  }

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

  const chunkToken = randomUUID();
  const claimed = await prisma.bulkInboxActionJob.updateMany({
    where: unchanged,
    data: { chunkToken, recoveryCount: { increment: 1 } },
  });
  if (claimed.count !== 1) return;

  logger.warn("Resuming a stalled bulk inbox action", {
    bulkInboxActionJobId: job.id,
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
