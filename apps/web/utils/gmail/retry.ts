import pRetry from "p-retry";
import { createScopedLogger } from "@/utils/logger";
import { sleep } from "@/utils/sleep";

const logger = createScopedLogger("gmail-retry");

interface ErrorInfo {
  status?: number;
  reason?: string;
  errorMessage: string;
}

/**
 * Extracts error information from various error shapes
 */
export function extractErrorInfo(error: any): ErrorInfo {
  const err: any = error;
  const cause = err?.cause ?? err;
  const status =
    cause?.status ?? cause?.code ?? cause?.response?.status ?? undefined;
  const reason =
    cause?.errors?.[0]?.reason ??
    cause?.response?.data?.error?.errors?.[0]?.reason ??
    undefined;
  const errorMessage = String(cause?.message ?? err?.message ?? "");

  return { status, reason, errorMessage };
}

/**
 * Determines if an error is retryable (rate limit or server error)
 */
export function isRetryableError(errorInfo: ErrorInfo): {
  retryable: boolean;
  isRateLimit: boolean;
  isServerError: boolean;
} {
  const { status, reason, errorMessage } = errorInfo;

  // Broad rate-limit detection: 429, 403 + known reasons, or well-known messages
  const isRateLimit =
    status === 429 ||
    (status === 403 &&
      ["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded"].includes(
        String(reason),
      )) ||
    /(^|[\s-])rate limit exceeded/i.test(errorMessage) ||
    /quota exceeded/i.test(errorMessage);

  // Temporary server errors that should be retried (502, 503, 504)
  const isServerError =
    status === 502 ||
    status === 503 ||
    status === 504 ||
    /502|503|504|server error|temporarily unavailable/i.test(errorMessage);

  return {
    retryable: isRateLimit || isServerError,
    isRateLimit,
    isServerError,
  };
}

/**
 * Calculates retry delay based on error type and attempt number
 */
export function calculateRetryDelay(
  isRateLimit: boolean,
  isServerError: boolean,
  attemptNumber: number,
  retryAfterHeader?: string,
  errorMessage?: string,
): number {
  // Try to parse retry time from error message
  const retryTime = parseRetryTime(errorMessage || "");
  if (retryTime) {
    return Math.max(0, retryTime.getTime() - Date.now());
  }

  // Handle Retry-After header
  if (retryAfterHeader) {
    const retryAfterSeconds = Number.parseInt(retryAfterHeader, 10);
    if (!Number.isNaN(retryAfterSeconds)) {
      return retryAfterSeconds * 1000;
    }

    // Try parsing as HTTP-date
    const retryDate = new Date(retryAfterHeader);
    if (!Number.isNaN(retryDate.getTime())) {
      return Math.max(0, retryDate.getTime() - Date.now());
    }
  }

  // Use different fallback delays based on error type
  if (isServerError) {
    // Exponential backoff for server errors: 5s, 10s, 20s, 40s, 80s
    return Math.min(5000 * 2 ** (attemptNumber - 1), 80_000);
  }

  if (isRateLimit) {
    // Fixed delay for rate limits (30 seconds as per Gmail's error message)
    return 30_000;
  }

  return 0;
}

/**
 * Retries a Gmail API operation when rate limits or temporary server errors are encountered
 * - Rate limits: 429, 403 with specific reasons
 * - Server errors: 502, 503, 504
 */
export async function withGmailRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 5,
): Promise<T> {
  return pRetry(operation, {
    retries: maxRetries,
    onFailedAttempt: async (error) => {
      const errorInfo = extractErrorInfo(error);
      const { retryable, isRateLimit, isServerError } =
        isRetryableError(errorInfo);

      if (!retryable) {
        logger.warn("Non-retryable error encountered", {
          error,
          status: errorInfo.status,
          reason: errorInfo.reason,
        });
        throw error;
      }

      const err: any = error;
      const cause = err?.cause ?? err;
      const retryAfterHeader = cause?.response?.headers?.["retry-after"];

      const delayMs = calculateRetryDelay(
        isRateLimit,
        isServerError,
        error.attemptNumber,
        retryAfterHeader,
        errorInfo.errorMessage,
      );

      logger.warn("Gmail error. Will retry", {
        delaySeconds: Math.ceil(delayMs / 1000),
        attemptNumber: error.attemptNumber,
        maxRetries,
        status: errorInfo.status,
        isRateLimit,
        isServerError,
      });

      // Apply the custom delay
      if (delayMs > 0) {
        await sleep(delayMs);
      }
    },
  });
}

/**
 * Parses the retry time from Gmail rate limit error messages
 * Example: "User-rate limit exceeded. Retry after 2025-08-22T18:22:38.763Z"
 */
function parseRetryTime(errorMessage: string): Date | null {
  const retryMatch = errorMessage.match(/Retry after (.+?)(\s|$)/);
  if (retryMatch?.[1]) {
    try {
      const retryDate = new Date(retryMatch[1]);
      // Validate the date is valid (not NaN)
      if (!Number.isNaN(retryDate.getTime())) {
        return retryDate;
      }
    } catch {
      // Invalid date format
    }
  }
  return null;
}
