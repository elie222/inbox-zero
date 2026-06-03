import chunk from "lodash/chunk";
import { type BatchError, isBatchError, isDefined } from "@/utils/types";
import { getBatch } from "@/utils/gmail/batch";
import { isRetryableError } from "@/utils/gmail/retry";
import { sleep } from "@/utils/sleep";
import type { Logger } from "@/utils/logger";

const RATE_LIMIT_RETRY_BATCH_SIZE = 10;

// Fetches a Gmail batch and handles per-item errors: throws on 401, retries
// retryable items (re-fetching only the missing ids, in smaller chunks when
// rate-limited), and drops non-retryable items with a warning. Without this,
// per-item batch errors are returned as-is and silently treated as
// valid-but-empty results, so threads/messages disappear under partial failure.
export async function getBatchWithRetry<TRaw, TParsed>({
  ids,
  endpoint,
  accessToken,
  parse,
  logger,
  retryCount = 0,
}: {
  ids: string[];
  endpoint: string; // e.g. /gmail/v1/users/me/messages
  accessToken: string;
  parse: (item: TRaw) => TParsed;
  logger: Logger;
  retryCount?: number;
}): Promise<TParsed[]> {
  if (!accessToken) throw new Error("No access token");

  if (retryCount > 3) {
    logger.error("Too many batch retries", { ids, retryCount });
    return [];
  }

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
  let shouldRetryInSmallerBatches = false;

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
            id: ids[i],
            code,
            reason,
            errorMessage,
          });
          return;
        }

        logger.warn("Error fetching batch item, adding to retry queue", {
          id: ids[i],
          code,
          errorMessage,
          reason,
        });
        if (isRateLimit) shouldRetryInSmallerBatches = true;
        missingIds.add(ids[i]);
        return;
      }

      return parse(item);
    })
    .filter(isDefined);

  if (missingIds.size > 0) {
    const remainingIds = Array.from(missingIds);
    logger.info("Missing batch items", {
      missingIds: remainingIds,
      retryMode: shouldRetryInSmallerBatches ? "chunked" : "batch",
    });
    const nextRetryCount = retryCount + 1;
    await sleep(1000 * nextRetryCount);
    const refetched = shouldRetryInSmallerBatches
      ? await getBatchWithRetryInChunks({
          ids: remainingIds,
          endpoint,
          accessToken,
          parse,
          retryCount: nextRetryCount,
          logger,
        })
      : await getBatchWithRetry({
          ids: remainingIds,
          endpoint,
          accessToken,
          parse,
          retryCount: nextRetryCount,
          logger,
        });
    return [...parsed, ...refetched];
  }

  return parsed;
}

async function getBatchWithRetryInChunks<TRaw, TParsed>({
  ids,
  endpoint,
  accessToken,
  parse,
  retryCount,
  logger,
}: {
  ids: string[];
  endpoint: string;
  accessToken: string;
  parse: (item: TRaw) => TParsed;
  retryCount: number;
  logger: Logger;
}): Promise<TParsed[]> {
  const chunked = chunk(ids, RATE_LIMIT_RETRY_BATCH_SIZE);
  const results: TParsed[] = [];

  for (const idsChunk of chunked) {
    const chunkResults = await getBatchWithRetry<TRaw, TParsed>({
      ids: idsChunk,
      endpoint,
      accessToken,
      parse,
      retryCount,
      logger,
    });
    results.push(...chunkResults);
  }

  return results;
}
