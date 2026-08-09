import chunk from "lodash/chunk";
import { type BatchError, isBatchError, isDefined } from "@/utils/types";
import { getBatch } from "@/utils/gmail/batch";
import { isRetryableError } from "@/utils/gmail/retry";
import { sleep } from "@/utils/sleep";
import type { Logger } from "@/utils/logger";

const GMAIL_BATCH_SIZE = 10;
const MAX_BATCH_RETRIES = 3;
const MAX_RETRY_JITTER_MS = 1000;

// Gmail executes batch subrequests concurrently, so keep each request small
// and sequential to avoid triggering the per-user concurrency limit. Retry only
// failed items and preserve provider errors for account-level rate-limit mode.
export async function getBatchWithRetry<TRaw, TParsed>({
  ids,
  endpoint,
  accessToken,
  parse,
  logger,
  retryCount = 0,
  retryError,
}: {
  ids: string[];
  endpoint: string; // e.g. /gmail/v1/users/me/messages
  accessToken: string;
  parse: (item: TRaw) => TParsed;
  logger: Logger;
  retryCount?: number;
  retryError?: BatchError["error"];
}): Promise<TParsed[]> {
  if (!accessToken) throw new Error("No access token");

  const results: TParsed[] = [];
  for (const idsChunk of chunk(ids, GMAIL_BATCH_SIZE)) {
    const chunkResults = await getBatchChunkWithRetry<TRaw, TParsed>({
      ids: idsChunk,
      endpoint,
      accessToken,
      parse,
      logger,
      retryCount,
      retryError,
    });
    results.push(...chunkResults);
  }

  return results;
}

async function getBatchChunkWithRetry<TRaw, TParsed>({
  ids,
  endpoint,
  accessToken,
  parse,
  logger,
  retryCount,
  retryError,
}: {
  ids: string[];
  endpoint: string;
  accessToken: string;
  parse: (item: TRaw) => TParsed;
  logger: Logger;
  retryCount: number;
  retryError?: BatchError["error"];
}): Promise<TParsed[]> {
  if (retryCount > MAX_BATCH_RETRIES)
    throwBatchRetryLimit({
      batchSize: ids.length,
      retryCount,
      retryError,
      logger,
    });

  const batch: (TRaw | BatchError)[] = await getBatch(
    ids,
    endpoint,
    accessToken,
  );

  if (batch.some((item) => isBatchError(item) && item.error.code === 401)) {
    logger.error("Error fetching batch", { firstBatchItem: batch?.[0] });
    throw new Error("Invalid access token");
  }

  const missingIds = new Set<string>();
  let lastRetryableError = retryError;
  let retryableItemCount = 0;
  let rateLimitedItemCount = 0;

  const parsed = batch
    .map((item, i) => {
      if (isBatchError(item)) {
        const { code, message: errorMessage, errors } = item.error;
        const reason = errors?.[0]?.reason;

        const { retryable, isRateLimit } = isRetryableError({
          status: code,
          reason,
          errorMessage,
        });

        if (!retryable) {
          logger.warn("Skipping batch item due to non-retryable error", {
            code,
            reason,
            errorMessage,
          });
          return;
        }

        retryableItemCount++;
        if (isRateLimit) rateLimitedItemCount++;
        if (isRateLimit || !lastRetryableError) {
          lastRetryableError = item.error;
        }
        missingIds.add(ids[i]);
        return;
      }

      return parse(item);
    })
    .filter(isDefined);

  if (missingIds.size > 0) {
    const remainingIds = Array.from(missingIds);
    const nextRetryCount = retryCount + 1;

    if (nextRetryCount > MAX_BATCH_RETRIES)
      throwBatchRetryLimit({
        batchSize: remainingIds.length,
        retryCount: nextRetryCount,
        retryError: lastRetryableError,
        logger,
      });

    logger.warn("Retrying Gmail batch items", {
      batchSize: ids.length,
      retryableItemCount,
      rateLimitedItemCount,
      retryCount: nextRetryCount,
    });
    const exponentialDelayMs = Math.min(
      1000 * 2 ** (nextRetryCount - 1),
      10_000,
    );
    const jitterMs = Math.floor(Math.random() * (MAX_RETRY_JITTER_MS + 1));
    await sleep(exponentialDelayMs + jitterMs);
    const refetched = await getBatchChunkWithRetry({
      ids: remainingIds,
      endpoint,
      accessToken,
      parse,
      retryCount: nextRetryCount,
      retryError: lastRetryableError,
      logger,
    });
    return [...parsed, ...refetched];
  }

  return parsed;
}

function throwBatchRetryLimit({
  batchSize,
  retryCount,
  retryError,
  logger,
}: {
  batchSize: number;
  retryCount: number;
  retryError?: BatchError["error"];
  logger: Logger;
}): never {
  logger.warn("Too many Gmail batch retries", { batchSize, retryCount });
  if (!retryError) throw new Error("Gmail batch retry limit exceeded");

  // Preserve the provider error so account-level rate-limit protection can pause follow-on calls.
  throw new Error(retryError.message, { cause: retryError });
}
