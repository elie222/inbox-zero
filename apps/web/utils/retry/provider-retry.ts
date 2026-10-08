import pRetry, { type RetryContext } from "p-retry";
import type { Logger } from "@/utils/logger";
import { sleep } from "@/utils/sleep";

// "rate-limit-only" is for non-idempotent writes: network, server, and conflict
// failures are ambiguous because the write may already have succeeded.
export type ProviderRetryPolicy = "all" | "rate-limit-only";

interface ProviderRetryDecision {
  delayMs: number;
  isRateLimit: boolean;
  logFields: Record<string, unknown>;
  retryable: boolean;
}

export async function withProviderRetry<T>(
  operation: () => Promise<T>,
  {
    classify,
    logger,
    maxBlockingDelayMs,
    maxRetries,
    providerName,
    retryPolicy,
  }: {
    classify: (attempt: RetryContext) => ProviderRetryDecision;
    logger: Logger;
    maxBlockingDelayMs: number;
    maxRetries: number;
    providerName: string;
    retryPolicy: ProviderRetryPolicy;
  },
): Promise<T> {
  return pRetry(operation, {
    retries: maxRetries,
    onFailedAttempt: async (attempt) => {
      const { retryable, isRateLimit, delayMs, logFields } = classify(attempt);

      if (!retryable || (retryPolicy === "rate-limit-only" && !isRateLimit)) {
        logger.warn("Non-retryable error encountered", {
          error: attempt.error,
          ...logFields,
          retryPolicy,
        });
        // Throwing the attempt context would hand callers p-retry's wrapper
        // instead of the provider error, so error classifiers would never match.
        throw attempt.error;
      }

      const retryLogFields = {
        delaySeconds: Math.ceil(delayMs / 1000),
        maxBlockingDelaySeconds: Math.ceil(maxBlockingDelayMs / 1000),
        attemptNumber: attempt.attemptNumber,
        maxRetries,
        ...logFields,
        retryPolicy,
      };

      logger.warn(`${providerName} error. Will retry`, retryLogFields);

      if (delayMs > maxBlockingDelayMs) {
        logger.warn(
          "Aborting retry due to long backoff in serverless",
          retryLogFields,
        );
        throw attempt.error;
      }

      if (delayMs > 0) {
        await sleep(delayMs);
      }
    },
  });
}

/**
 * Parses a Retry-After header given as delta-seconds or an HTTP-date.
 * Returns undefined when the header is missing, unparseable, or already in the
 * past, so callers can fall back to their own backoff.
 */
export function getRetryAfterDelayMs(
  retryAfterHeader: string | undefined,
): number | undefined {
  if (!retryAfterHeader) return;

  const retryAfterSeconds = Number.parseInt(retryAfterHeader, 10);
  if (!Number.isNaN(retryAfterSeconds)) return retryAfterSeconds * 1000;

  const retryDate = new Date(retryAfterHeader);
  if (Number.isNaN(retryDate.getTime())) return;

  const delayMs = retryDate.getTime() - Date.now();
  return delayMs > 0 ? delayMs : undefined;
}
