import "server-only";

import { createScopedLogger } from "@/utils/logger";
import { sleep } from "@/utils/sleep";

const logger = createScopedLogger("llms");

const MAX_RETRIES = 2;

/**
 * General-purpose retry utility with custom retry condition.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  {
    retryIf,
    maxRetries,
    delayMs,
  }: {
    retryIf: (error: unknown) => boolean;
    maxRetries: number;
    delayMs: number;
  },
): Promise<T> {
  let attempts = 0;
  let lastError: unknown;

  while (attempts < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      attempts++;
      lastError = error;

      if (retryIf(error)) {
        logger.warn("Operation failed. Retrying...", {
          attempts,
          error,
        });

        if (attempts < maxRetries) {
          await sleep(delayMs);
          continue;
        }
      }

      throw error;
    }
  }

  throw lastError;
}

/**
 * Checks if an error is a transient network error that should be retried.
 * The AI SDK incorrectly marks these as non-retryable when they occur during
 * response body parsing (after HTTP 200).
 */
export function isTransientNetworkError(error: unknown): boolean {
  // JSON.stringify doesn't capture Error's non-enumerable properties (message, name),
  // so we need to extract text from Error objects explicitly
  const errorText =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? `${error.name}: ${error.message} ${String((error as NodeJS.ErrnoException).code ?? "")}`
        : JSON.stringify(error);

  const networkErrorCodes = ["ECONNRESET", "ETIMEDOUT", "ECONNREFUSED"];
  const networkErrorMessages = ["fetch failed", "terminated"];

  return (
    networkErrorCodes.some((code) => errorText.includes(code)) ||
    networkErrorMessages.some((msg) => errorText.includes(msg))
  );
}

/**
 * Retries an async function on transient network errors with exponential backoff.
 * Also supports custom retry conditions (e.g., validation errors).
 */
export async function withNetworkRetry<T>(
  fn: () => Promise<T>,
  options: {
    label: string;
    shouldRetry?: (error: unknown) => boolean;
  },
): Promise<T> {
  const { label, shouldRetry } = options;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const isNetworkError = isTransientNetworkError(error);
      const isCustomRetryable = shouldRetry?.(error) ?? false;
      const isRetryable = isNetworkError || isCustomRetryable;

      if (isRetryable && attempt < MAX_RETRIES) {
        const errorType = isNetworkError ? "network" : "validation";
        logger.warn(`Retrying after ${errorType} error`, {
          label,
          attempt,
          maxRetries: MAX_RETRIES,
          errorType,
          error,
        });

        // Exponential backoff: 1s, 2s, 4s
        const delayMs = 1000 * 2 ** attempt;
        await sleep(delayMs);
        continue;
      }

      throw error;
    }
  }

  // Should never reach here, but TypeScript needs it
  throw new Error("Unexpected: exceeded retry loop");
}
