import type { ModelMessage } from "ai";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const STATUS_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const MAX_JOBS = 5;

/**
 * Current totals for bulk actions confirmed in this chat. The job runs after
 * the turn that started it, so this is the only accurate source for its
 * progress, including after the chat history is compacted.
 */
export async function buildBulkInboxActionStatusMessage({
  chatId,
  logger,
}: {
  chatId: string;
  logger: Logger;
}): Promise<ModelMessage | null> {
  try {
    const jobs = await prisma.bulkInboxActionJob.findMany({
      where: {
        chatId,
        OR: [
          { status: "RUNNING" },
          { updatedAt: { gte: new Date(Date.now() - STATUS_LOOKBACK_MS) } },
        ],
      },
      // RUNNING sorts first, so a running job is never cut by the cap.
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
      take: MAX_JOBS,
      select: {
        id: true,
        status: true,
        action: true,
        search: true,
        labelName: true,
        instruction: true,
        processedCount: true,
        matchedCount: true,
        actedCount: true,
        skippedCount: true,
        failedCount: true,
        error: true,
      },
    });
    if (!jobs.length) return null;

    const lines = jobs.map((job) =>
      JSON.stringify({
        jobId: job.id,
        status: job.status.toLowerCase(),
        action: job.action,
        search: job.search,
        ...(job.labelName && { labelName: job.labelName }),
        ...(job.instruction && { instruction: job.instruction }),
        processed: job.processedCount,
        matched: job.matchedCount,
        acted: job.actedCount,
        skipped: job.skippedCount,
        failed: job.failedCount,
        ...(job.error && { error: job.error }),
      }),
    );

    return {
      role: "user",
      content: `Bulk inbox actions from this chat, with live totals from the background job. Use these numbers when reporting progress. Counts are email threads: processed = threads checked so far, matched = threads that qualified for the action, acted = threads the action succeeded on, skipped = threads that did not match the instruction, failed = threads left unchanged after an error. A running job is still going.\n${lines.join("\n")}`,
    };
  } catch (error) {
    logger.warn("Failed to load bulk inbox action status", { error });
    return null;
  }
}
