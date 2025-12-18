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
  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (retryIf(error) && attempt < maxRetries) {
        logger.warn("Operation failed. Retrying...", {
          attempt,
          maxRetries,
          error,
        });
        await sleep(delayMs);
        continue;
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
  let errorText: string;
  if (typeof error === "string") {
    errorText = error;
  } else if (error instanceof Error) {
    errorText = `${error.name}: ${error.message} ${String((error as NodeJS.ErrnoException).code ?? "")}`;
    // Check nested cause chain (AI SDK error structure)
    if (error.cause) {
      const cause = error.cause as {
        message?: string;
        code?: string;
        cause?: { code?: string };
      };
      if (cause.message) errorText += ` ${cause.message}`;
      if (cause.code) errorText += ` ${cause.code}`;
      if (cause.cause?.code) errorText += ` ${cause.cause.code}`;
    }
  } else {
    try {
      errorText = JSON.stringify(error);
    } catch {
      errorText = String(error);
    }
  }

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
