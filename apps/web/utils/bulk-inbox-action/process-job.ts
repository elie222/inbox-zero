import { randomUUID } from "node:crypto";
import { aiFilterEmailsForBulkAction } from "@/utils/ai/bulk-inbox-action/filter-emails";
import {
  type BoundedConcurrencyResult,
  runWithBoundedConcurrency,
} from "@/utils/async";
import {
  BULK_INBOX_ACTION_MAX_THREADS,
  type BulkInboxActionType,
  bulkInboxActionSearchSchema,
} from "@/utils/bulk-inbox-action/validation";
import { searchBulkInboxActionPage } from "@/utils/bulk-inbox-action/search";
import { createEmailProvider } from "@/utils/email/provider";
import { isEmailProviderRateLimitError } from "@/utils/email/is-provider-rate-limit-error";
import { getProviderRateLimitRetryAfterSeconds } from "@/utils/email/rate-limit";
import type { EmailProvider } from "@/utils/email/types";
import { applyLabelToThread } from "@/utils/label/apply-label-to-thread";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { sleep } from "@/utils/sleep";
import type { ParsedMessage } from "@/utils/types";
import { getEmailAccountWithAi } from "@/utils/user/get";

const SEARCH_PAGE_SIZE = 50;
const FILTER_BATCH_SIZE = 25;
const ACTION_CONCURRENCY = 3;
const WRITE_GROUP_SIZE = 5;
const DEFAULT_RATE_LIMIT_DELAY_MS = 30_000;
// Longer than the route's maxDuration, so a live chunk never loses its lease.
const LEASE_MS = 330_000;
// Leaves two minutes of the route's 300s maxDuration for the page that is
// in flight when the budget runs out, so its progress is always saved.
export const BULK_INBOX_ACTION_CHUNK_BUDGET_MS = 3 * 60 * 1000;

type ChunkOutcome =
  | { status: "completed" | "stopped" | "stale" | "busy" }
  | { status: "continue"; nextChunkToken: string };

/**
 * Runs one time-boxed chunk of a confirmed bulk inbox action. Progress is
 * saved after every batch, so a chunk can stop at any point and the next one
 * resumes from the saved page. Returns "continue", with the token for the next
 * chunk, when more work remains.
 */
export async function processBulkInboxActionJobChunk({
  jobId,
  chunkToken,
  logger: parentLogger,
  budgetMs = BULK_INBOX_ACTION_CHUNK_BUDGET_MS,
  maxThreads = BULK_INBOX_ACTION_MAX_THREADS,
}: {
  jobId: string;
  chunkToken: string;
  logger: Logger;
  budgetMs?: number;
  maxThreads?: number;
}): Promise<ChunkOutcome> {
  const logger = parentLogger.with({ bulkInboxActionJobId: jobId });
  const startedAt = Date.now();
  const deadline = startedAt + budgetMs;

  const claimed = await prisma.bulkInboxActionJob.updateMany({
    where: {
      id: jobId,
      status: "RUNNING",
      chunkToken,
      OR: [
        { leaseExpiresAt: null },
        { leaseExpiresAt: { lt: new Date(startedAt) } },
      ],
    },
    data: { leaseExpiresAt: new Date(startedAt + LEASE_MS) },
  });
  if (claimed.count === 0) {
    const job = await prisma.bulkInboxActionJob.findUnique({
      where: { id: jobId },
      select: { status: true, chunkToken: true },
    });
    // A live chunk holds the lease. Its holder may have died, so the caller
    // retries this delivery once the lease expires.
    return job?.status === "RUNNING" && job.chunkToken === chunkToken
      ? { status: "busy" }
      : { status: "stale" };
  }

  let outcome: ChunkOutcome;
  try {
    outcome = await runChunk({ jobId, deadline, maxThreads, logger });
  } catch (error) {
    // A cooldown can reject the provider before the page loop handles it.
    if (isEmailProviderRateLimitError({ error, provider: undefined })) {
      logger.warn("Bulk inbox action paused by a provider rate limit");
      await saveProgress(jobId, {
        rateLimitedUntil: getRateLimitedUntil(error, ""),
      });
      outcome = { status: "continue", nextChunkToken: randomUUID() };
    } else {
      logger.error("Bulk inbox action failed", { error });
      await failJob(jobId, "The email provider returned an error.");
      outcome = { status: "stopped" };
    }
  }

  const handedOff = await releaseLease({
    jobId,
    chunkToken,
    nextChunkToken:
      outcome.status === "continue" ? outcome.nextChunkToken : undefined,
    logger,
  });
  // The next token never reached the database. Retrying this delivery
  // resumes the job with the token it still holds once the lease expires.
  if (outcome.status === "continue" && !handedOff) return { status: "busy" };
  return outcome;
}

async function runChunk({
  jobId,
  deadline,
  maxThreads,
  logger,
}: {
  jobId: string;
  deadline: number;
  maxThreads: number;
  logger: Logger;
}): Promise<ChunkOutcome> {
  const continueLater = (): ChunkOutcome => ({
    status: "continue",
    nextChunkToken: randomUUID(),
  });

  const job = await prisma.bulkInboxActionJob.findUnique({
    where: { id: jobId },
  });
  if (!job) return { status: "stopped" };

  const emailAccount = await getEmailAccountWithAi({
    emailAccountId: job.emailAccountId,
  });
  if (!emailAccount) {
    await failJob(jobId, "Email account not found");
    return { status: "stopped" };
  }

  const provider = emailAccount.account.provider;
  const emailProvider = await createEmailProvider({
    emailAccountId: job.emailAccountId,
    provider,
    logger,
  });
  const search = bulkInboxActionSearchSchema.parse(job.search);
  const action = job.action as BulkInboxActionType;

  let pageToken = job.pageToken;
  let remainingThreads = maxThreads - job.processedCount;
  let rateLimitedUntil = job.rateLimitedUntil?.getTime() ?? 0;

  while (Date.now() < deadline) {
    if (!(await isJobRunning(jobId))) return { status: "stopped" };
    if (remainingThreads <= 0) {
      await completeJob(jobId, { limitReached: true });
      logger.info("Bulk inbox action reached its thread limit");
      return { status: "completed" };
    }

    const waitMs = rateLimitedUntil - Date.now();
    if (waitMs > 0) {
      // A cooldown longer than this chunk waits out the budget first, so
      // chunks don't spin through the queue until it ends.
      const remainingMs = deadline - Date.now();
      if (waitMs >= remainingMs) {
        await sleep(Math.max(remainingMs, 0));
        return continueLater();
      }
      await sleep(waitMs);
      rateLimitedUntil = 0;
      continue;
    }

    let page: Awaited<ReturnType<typeof searchBulkInboxActionPage>>;
    try {
      page = await searchBulkInboxActionPage({
        emailProvider,
        provider,
        search,
        pageToken,
        pageSize: SEARCH_PAGE_SIZE,
      });
    } catch (error) {
      if (!isRateLimitError(error, provider)) throw error;
      rateLimitedUntil = getRateLimitedUntil(error, provider);
      await saveProgress(jobId, { rateLimitedUntil });
      continue;
    }

    const threads = getLatestMessagePerThread(page.messages);
    const handledThreadIds = await getHandledThreadIds(
      jobId,
      threads.map((message) => message.threadId),
    );
    const unseen = threads.filter(
      (message) => !handledThreadIds.has(message.threadId),
    );

    // The page holds nothing new, so move on. While the action removes
    // threads from the results, the same page is fetched again instead,
    // because later matches shift into it.
    if (!unseen.length) {
      if (!page.nextPageToken) {
        await completeJob(jobId, { limitReached: false });
        logger.info("Bulk inbox action completed");
        return { status: "completed" };
      }

      pageToken = page.nextPageToken;
      await saveProgress(jobId, { pageToken });
      continue;
    }

    // Saving after each small batch keeps the card's progress moving and
    // limits what a crashed chunk has to redo.
    const allowed = unseen.slice(0, remainingThreads);
    for (
      let index = 0;
      index < allowed.length && Date.now() < deadline;
      index += FILTER_BATCH_SIZE
    ) {
      const result = await processThreads({
        jobId,
        threads: allowed.slice(index, index + FILTER_BATCH_SIZE),
        action,
        labelId: job.labelId,
        labelName: job.labelName,
        instruction: job.instruction,
        emailAccount,
        emailProvider,
        provider,
        logger,
      });

      remainingThreads -= result.totals.processed;
      if (result.rateLimitError) {
        rateLimitedUntil = getRateLimitedUntil(result.rateLimitError, provider);
      }

      await saveProgress(jobId, {
        handledThreadIds: result.handledThreadIds,
        rateLimitedUntil: result.rateLimitError ? rateLimitedUntil : null,
        totals: result.totals,
      });

      if (result.cancelled) return { status: "stopped" };
      if (result.rateLimitError) break;
    }
  }

  return continueLater();
}

async function processThreads({
  jobId,
  threads,
  action,
  labelId,
  labelName,
  instruction,
  emailAccount,
  emailProvider,
  provider,
  logger,
}: {
  jobId: string;
  threads: ParsedMessage[];
  action: BulkInboxActionType;
  labelId: string | null;
  labelName: string | null;
  instruction: string | null;
  emailAccount: EmailAccountWithAI;
  emailProvider: EmailProvider;
  provider: string;
  logger: Logger;
}) {
  const totals = { processed: 0, matched: 0, acted: 0, skipped: 0, failed: 0 };
  const handledThreadIds: string[] = [];
  const toAct: ParsedMessage[] = [];

  for (let index = 0; index < threads.length; index += FILTER_BATCH_SIZE) {
    const batch = threads.slice(index, index + FILTER_BATCH_SIZE);
    if (!instruction) {
      toAct.push(...batch);
      continue;
    }

    let matchingIds: Set<string>;
    try {
      ({ matchingIds } = await aiFilterEmailsForBulkAction({
        emailAccount,
        instruction,
        messages: batch,
      }));
    } catch (error) {
      // Leave these threads untouched rather than guess.
      logger.warn("Failed to filter bulk inbox action batch", { error });
      totals.processed += batch.length;
      totals.failed += batch.length;
      handledThreadIds.push(...batch.map((message) => message.threadId));
      continue;
    }

    for (const message of batch) {
      if (matchingIds.has(message.id)) {
        toAct.push(message);
      } else {
        totals.processed++;
        totals.skipped++;
        handledThreadIds.push(message.threadId);
      }
    }
  }

  // Filtering can take a while, so honour a Stop pressed meanwhile before
  // touching any mail.
  if (toAct.length && !(await isJobRunning(jobId))) {
    return {
      totals,
      handledThreadIds,
      rateLimitError: undefined,
      cancelled: true,
    };
  }

  let rateLimitError: unknown;
  let cancelled = false;
  const results: BoundedConcurrencyResult<ParsedMessage, void>[] = [];
  // Small write groups, so a Stop pressed mid-batch takes effect quickly.
  for (let index = 0; index < toAct.length; index += WRITE_GROUP_SIZE) {
    if (index > 0 && !(await isJobRunning(jobId))) {
      cancelled = true;
      break;
    }
    const groupResults = await runWithBoundedConcurrency({
      items: toAct.slice(index, index + WRITE_GROUP_SIZE),
      concurrency: ACTION_CONCURRENCY,
      run: async (message) => {
        // Once the provider rate limits, leave the rest for after the wait.
        if (rateLimitError) throw rateLimitError;
        try {
          await applyAction({
            action,
            threadId: message.threadId,
            ownerEmail: emailAccount.email,
            labelId,
            labelName,
            emailProvider,
          });
        } catch (error) {
          if (isRateLimitError(error, provider)) rateLimitError ??= error;
          throw error;
        }
      },
    });
    results.push(...groupResults);
    if (rateLimitError) break;
  }

  for (const { item: message, result } of results) {
    if (
      result.status === "rejected" &&
      isRateLimitError(result.reason, provider)
    ) {
      continue;
    }

    totals.processed++;
    totals.matched++;
    handledThreadIds.push(message.threadId);
    if (result.status === "fulfilled") {
      totals.acted++;
    } else {
      totals.failed++;
      logger.warn("Bulk inbox action failed for thread", {
        threadId: message.threadId,
        error: result.reason,
      });
    }
  }

  return { totals, handledThreadIds, rateLimitError, cancelled };
}

async function applyAction({
  action,
  threadId,
  ownerEmail,
  labelId,
  labelName,
  emailProvider,
}: {
  action: BulkInboxActionType;
  threadId: string;
  ownerEmail: string;
  labelId: string | null;
  labelName: string | null;
  emailProvider: EmailProvider;
}) {
  switch (action) {
    case "archive_threads":
      return emailProvider.archiveThread(threadId, ownerEmail);
    case "trash_threads":
      return emailProvider.trashThread(threadId, ownerEmail, "user");
    case "mark_read_threads":
      return emailProvider.markReadThread(threadId, true);
    case "label_threads":
      if (!labelId) throw new Error("Missing label for label action");
      return applyLabelToThread({
        emailProvider,
        threadId,
        labelId,
        labelName,
      });
  }
}

async function saveProgress(
  jobId: string,
  {
    pageToken,
    handledThreadIds = [],
    rateLimitedUntil,
    totals,
  }: {
    pageToken?: string | null;
    handledThreadIds?: string[];
    rateLimitedUntil?: number | null;
    totals?: {
      processed: number;
      matched: number;
      acted: number;
      skipped: number;
      failed: number;
    };
  },
) {
  // One transaction, so a crash never records threads without their totals
  // or counts threads that a retry would process again.
  await prisma.$transaction([
    prisma.bulkInboxActionThread.createMany({
      data: handledThreadIds.map((threadId) => ({ jobId, threadId })),
      skipDuplicates: true,
    }),
    prisma.bulkInboxActionJob.update({
      where: { id: jobId },
      data: {
        ...(pageToken !== undefined && { pageToken }),
        ...(rateLimitedUntil !== undefined && {
          rateLimitedUntil: rateLimitedUntil
            ? new Date(rateLimitedUntil)
            : null,
        }),
        ...(totals && {
          processedCount: { increment: totals.processed },
          matchedCount: { increment: totals.matched },
          actedCount: { increment: totals.acted },
          skippedCount: { increment: totals.skipped },
          failedCount: { increment: totals.failed },
        }),
      },
    }),
  ]);
}

async function getHandledThreadIds(jobId: string, threadIds: string[]) {
  const rows = await prisma.bulkInboxActionThread.findMany({
    where: { jobId, threadId: { in: threadIds } },
    select: { threadId: true },
  });
  return new Set(rows.map((row) => row.threadId));
}

async function releaseLease({
  jobId,
  chunkToken,
  nextChunkToken,
  logger,
}: {
  jobId: string;
  chunkToken: string;
  nextChunkToken?: string;
  logger: Logger;
}) {
  try {
    const released = await prisma.bulkInboxActionJob.updateMany({
      where: { id: jobId, status: "RUNNING", chunkToken },
      data: {
        leaseExpiresAt: null,
        ...(nextChunkToken && { chunkToken: nextChunkToken }),
      },
    });
    return released.count === 1;
  } catch (error) {
    logger.error("Failed to release bulk inbox action lease", { error });
    return false;
  }
}

// Only a running job completes, so a Stop that landed meanwhile stays.
async function completeJob(
  jobId: string,
  { limitReached }: { limitReached: boolean },
) {
  await prisma.bulkInboxActionJob.updateMany({
    where: { id: jobId, status: "RUNNING" },
    data: {
      status: "COMPLETED",
      completedAt: new Date(),
      leaseExpiresAt: null,
      limitReached,
    },
  });
}

async function isJobRunning(jobId: string) {
  const job = await prisma.bulkInboxActionJob.findUnique({
    where: { id: jobId },
    select: { status: true },
  });
  return job?.status === "RUNNING";
}

async function failJob(jobId: string, error: string) {
  await prisma.bulkInboxActionJob.updateMany({
    where: { id: jobId, status: "RUNNING" },
    data: {
      status: "FAILED",
      error,
      completedAt: new Date(),
      leaseExpiresAt: null,
    },
  });
}

function isRateLimitError(error: unknown, provider: string) {
  return (
    isEmailProviderRateLimitError({ error, provider }) ||
    (error instanceof Error &&
      isEmailProviderRateLimitError({ error: error.cause, provider }))
  );
}

function getRateLimitedUntil(error: unknown, provider: string) {
  const providerError =
    error instanceof Error && error.cause ? error.cause : error;
  const retryAfterSeconds =
    getProviderRateLimitRetryAfterSeconds({ error, provider }) ??
    getProviderRateLimitRetryAfterSeconds({ error: providerError, provider });
  const delayMs = retryAfterSeconds
    ? retryAfterSeconds * 1000
    : DEFAULT_RATE_LIMIT_DELAY_MS;
  return Date.now() + delayMs;
}

function getLatestMessagePerThread(messages: ParsedMessage[]) {
  const latestByThread = new Map<string, ParsedMessage>();
  for (const message of messages) {
    if (!message.threadId) continue;
    const existing = latestByThread.get(message.threadId);
    if (
      !existing ||
      new Date(message.date || 0) > new Date(existing.date || 0)
    ) {
      latestByThread.set(message.threadId, message);
    }
  }
  return [...latestByThread.values()];
}
