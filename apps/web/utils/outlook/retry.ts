import pRetry from "p-retry";
import { createScopedLogger } from "@/utils/logger";
import { sleep } from "@/utils/sleep";
import { isFetchError } from "@/utils/retry/is-fetch-error";

const logger = createScopedLogger("outlook-retry");

interface ErrorInfo {
  status?: number;
  code?: string;
  errorMessage: string;
}

/**
 * Retries a Microsoft Graph API operation when rate limits or temporary server errors are encountered
 * - Rate limits: 429, "TooManyRequests" code
 * - Server errors: 502, 503, 504, "ServiceNotAvailable", "ServerBusy"
 */
export async function withOutlookRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 5,
): Promise<T> {
  return pRetry(operation, {
    retries: maxRetries,
    onFailedAttempt: async (error) => {
      const errorInfo = extractErrorInfo(error);
      const { retryable, isRateLimit, isServerError, isConflictError } =
        isRetryableError(errorInfo);

      if (!retryable) {
        logger.warn("Non-retryable error encountered", {
          error,
          status: errorInfo.status,
          code: errorInfo.code,
        });
        throw error;
      }

      const err = error as Record<string, unknown>;
      const retryAfterHeader =
        (
          (err?.response as Record<string, unknown>)?.headers as Record<
            string,
            string
          >
        )?.["retry-after"] ??
        (
          (err?.response as Record<string, unknown>)?.headers as Record<
            string,
            string
          >
        )?.["Retry-After"];

      const delayMs = calculateRetryDelay(
        isRateLimit,
        isServerError,
        isConflictError,
        error.attemptNumber,
        retryAfterHeader,
      );

      logger.warn("Microsoft Graph error. Will retry", {
        delaySeconds: Math.ceil(delayMs / 1000),
        attemptNumber: error.attemptNumber,
        maxRetries,
        status: errorInfo.status,
        code: errorInfo.code,
        isRateLimit,
        isServerError,
        isConflictError,
        isFetchError: isFetchError(errorInfo),
      });

      // Apply the custom delay
      if (delayMs > 0) {
        await sleep(delayMs);
      }
    },
  });
}

/**
 * Extracts error information from Microsoft Graph API errors
 */
export function extractErrorInfo(error: unknown): ErrorInfo {
  const err = error as Record<string, unknown>;

  // Microsoft Graph SDK errors typically have statusCode or code properties
  const status =
    (err?.statusCode as number) ??
    (err?.status as number) ??
    ((err?.response as Record<string, unknown>)?.status as number) ??
    undefined;

  // Error code from Microsoft Graph (e.g., "TooManyRequests", "ServiceNotAvailable")
  const code =
    (err?.code as string) ??
    ((err?.error as Record<string, unknown>)?.code as string) ??
    undefined;

  // Extract error message
  const primaryMessage =
    (err?.message as string) ??
    ((err?.error as Record<string, unknown>)?.message as string) ??
    (err?.body as string) ??
    "";

  const errorMessage = String(primaryMessage);

  return { status, code, errorMessage };
}

/**
 * Determines if an error is retryable (rate limit, server error, conflict, or network error)
 */
export function isRetryableError(errorInfo: ErrorInfo): {
  retryable: boolean;
  isRateLimit: boolean;
  isServerError: boolean;
  isConflictError: boolean;
} {
  const { status, code, errorMessage } = errorInfo;

  // Rate limit detection: 429 status or "TooManyRequests" code
  const isRateLimit =
    status === 429 ||
    code === "TooManyRequests" ||
    /rate limit/i.test(errorMessage) ||
    /quota exceeded/i.test(errorMessage);

  // Temporary server errors that should be retried (502, 503, 504)
  const isServerError =
    status === 502 ||
    status === 503 ||
    status === 504 ||
    code === "ServiceNotAvailable" ||
    code === "ServerBusy" ||
    /502|503|504|server error|temporarily unavailable|service unavailable/i.test(
      errorMessage,
    );

  // Conflict errors from stale change keys (412)
  const isConflictError =
    status === 412 ||
    code === "ErrorIrresolvableConflict" ||
    /change key/i.test(errorMessage);

  return {
    retryable:
      isRateLimit ||
      isServerError ||
      isConflictError ||
      isFetchError(errorInfo),
    isRateLimit,
    isServerError,
    isConflictError,
  };
}

/**
 * Calculates retry delay based on error type and attempt number
 */
export function calculateRetryDelay(
  isRateLimit: boolean,
  isServerError: boolean,
  isConflictError: boolean,
  attemptNumber: number,
  retryAfterHeader?: string,
): number {
  // Handle Retry-After header
  if (retryAfterHeader) {
    const retryAfterSeconds = Number.parseInt(retryAfterHeader, 10);
    if (!Number.isNaN(retryAfterSeconds)) {
      return retryAfterSeconds * 1000;
    }

    // Try parsing as HTTP-date
    const retryDate = new Date(retryAfterHeader);
    if (!Number.isNaN(retryDate.getTime())) {
      const delayMs = Math.max(0, retryDate.getTime() - Date.now());
      if (delayMs > 0) {
        return delayMs;
      }
      // If stale, fall through to fallback logic
    }
  }

  // Use different fallback delays based on error type
  if (isConflictError) {
    // Fast exponential backoff for conflict errors: 500ms, 1s, 2s, 4s, 8s
    // Conflicts resolve quickly once the stale operation completes
    return Math.min(500 * 2 ** (attemptNumber - 1), 8000);
  }

  if (isServerError) {
    // Exponential backoff for server errors: 5s, 10s, 20s, 40s, 80s
    return Math.min(5000 * 2 ** (attemptNumber - 1), 80_000);
  }

  if (isRateLimit) {
    // Fixed delay for rate limits (30 seconds as per Microsoft Graph recommendations)
    return 30_000;
  }

  // Default exponential backoff for other retryable errors: 1s, 2s, 4s, 8s, 16s
  return Math.min(1000 * 2 ** (attemptNumber - 1), 16_000);
}
