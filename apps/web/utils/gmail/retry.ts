import pRetry, { AbortError } from "p-retry";
import { createScopedLogger, type Logger } from "@/utils/logger";
import { sleep } from "@/utils/sleep";
import { isFetchError } from "@/utils/retry/is-fetch-error";

const logger = createScopedLogger("gmail-retry");
export const MAX_GMAIL_BLOCKING_RETRY_DELAY_MS = 10_000;

interface RetryLogContext {
  logger?: Logger;
}

interface ErrorInfo {
  status?: number;
  code?: string;
  reason?: string;
  googleErrorStatus?: string;
  errorMessage: string;
}

/**
 * Retries a Gmail API operation when rate limits or temporary server errors are encountered
 * - Rate limits: 429, 403 with specific reasons
 * - Server errors: 502, 503, 504
 */
export async function withGmailRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 5,
  context?: RetryLogContext,
): Promise<T> {
  const retryLogger = context?.logger || logger;

  try {
    return await pRetry(operation, {
      retries: maxRetries,
      onFailedAttempt: async (attempt) => {
        const originalError = getRetryAttemptError(attempt);
        const attemptNumber = getRetryAttemptNumber(attempt);
        const errorInfo = extractErrorInfo(originalError);
        const { retryable, isRateLimit, isServerError, isFailedPrecondition } =
          isRetryableError(errorInfo);
        const retryLogFields = buildRetryLogFields(errorInfo);

        if (!retryable) {
          retryLogger.warn("Non-retryable error encountered", retryLogFields);
          throw originalError;
        }

        const retryAfterHeader = getRetryAfterHeader(originalError);
        const retryAfterFromMessage = parseRetryTime(
          errorInfo.errorMessage,
        )?.toISOString();

        const delayMs = calculateRetryDelay(
          isRateLimit,
          isServerError,
          isFailedPrecondition,
          attemptNumber,
          retryAfterHeader,
          errorInfo.errorMessage,
        );

        retryLogger.warn("Gmail error. Will retry", {
          delaySeconds: Math.ceil(delayMs / 1000),
          attemptNumber,
          maxRetries,
          ...retryLogFields,
          retryAfterHeader,
          retryAfterFromMessage,
          isRateLimit,
          isServerError,
          isFailedPrecondition,
        });

        if (delayMs > MAX_GMAIL_BLOCKING_RETRY_DELAY_MS) {
          retryLogger.warn("Aborting retry due to long backoff in serverless", {
            delaySeconds: Math.ceil(delayMs / 1000),
            maxBlockingDelaySeconds: Math.ceil(
              MAX_GMAIL_BLOCKING_RETRY_DELAY_MS / 1000,
            ),
            attemptNumber,
            maxRetries,
            ...retryLogFields,
          });
          throw new AbortError(
            toErrorInstance(
              originalError,
              errorInfo.errorMessage ||
                "Aborted retry due to long backoff in serverless",
            ),
          );
        }

        // Apply the custom delay
        if (delayMs > 0) {
          await sleep(delayMs);
        }
      },
    });
  } catch (error) {
    const originalError = getAbortOriginalError(error);
    if (originalError !== undefined) throw originalError;
    throw error;
  }
}

/**
 * Extracts error information from various error shapes
 */
export function extractErrorInfo(error: unknown): ErrorInfo {
  const err = toRecord(getRetryAttemptError(error));
  const cause = toRecord(err.cause ?? err);
  const response = toRecord(cause.response);
  const responseData = toRecord(response.data);
  const responseError = toRecord(responseData.error);
  const status =
    (cause?.status as number) ??
    (cause?.code as number) ??
    (response.status as number) ??
    undefined;
  const code =
    (err?.code as string) ??
    (cause?.code as string) ??
    (responseError.code as string) ??
    undefined;
  const reason =
    getFirstErrorValue(cause.errors, "reason") ??
    getFirstErrorValue(responseError.errors, "reason") ??
    undefined;
  const googleErrorStatus = (responseError.status as string) ?? undefined;
  const primaryMessage =
    (cause?.message as string) ??
    (err?.message as string) ??
    (cause?.error as string) ??
    (err?.error as string) ??
    getFirstErrorValue(cause.errors, "message") ??
    (responseError.message as string) ??
    (responseError.error as string as string) ??
    "";

  const errorMessage = String(primaryMessage);

  return { status, code, reason, googleErrorStatus, errorMessage };
}

/**
 * Determines if an error is retryable (rate limit, server error, or network error)
 */
export function isRetryableError(errorInfo: ErrorInfo): {
  retryable: boolean;
  isRateLimit: boolean;
  isServerError: boolean;
  isFailedPrecondition: boolean;
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

  // Temporary server errors that should be retried
  const isServerError =
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    /500|502|503|504|internal error|server error|temporarily unavailable/i.test(
      errorMessage,
    );

  const isFailedPrecondition =
    status === 400 &&
    (String(reason).toLowerCase() === "failedprecondition" ||
      /precondition check failed/i.test(errorMessage));

  return {
    retryable:
      isRateLimit ||
      isServerError ||
      isFailedPrecondition ||
      isFetchError(errorInfo),
    isRateLimit,
    isServerError,
    isFailedPrecondition,
  };
}

/**
 * Calculates retry delay based on error type and attempt number
 */
export function calculateRetryDelay(
  isRateLimit: boolean,
  isServerError: boolean,
  isFailedPrecondition: boolean,
  attemptNumber: number,
  retryAfterHeader?: string,
  errorMessage?: string,
): number {
  // Try to parse retry time from error message
  const retryTime = parseRetryTime(errorMessage || "");
  if (retryTime) {
    const delayMs = Math.max(0, retryTime.getTime() - Date.now());
    if (delayMs > 0) {
      return delayMs;
    }
    // If stale, fall through to fallback logic
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
      const delayMs = Math.max(0, retryDate.getTime() - Date.now());
      if (delayMs > 0) {
        return delayMs;
      }
      // If stale, fall through to fallback logic
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

  if (isFailedPrecondition) {
    // Short exponential backoff for transient precondition failures: 1s, 2s, 4s, 8s, 10s
    return Math.min(1000 * 2 ** (attemptNumber - 1), 10_000);
  }

  // Default exponential backoff for other retryable errors: 1s, 2s, 4s, 8s, 16s
  return Math.min(1000 * 2 ** (attemptNumber - 1), 16_000);
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

function trimErrorMessage(errorMessage: string): string | undefined {
  const trimmed = errorMessage.trim();
  if (!trimmed) return undefined;
  if (trimmed.length <= 500) return trimmed;
  return `${trimmed.slice(0, 497)}...`;
}

function buildRetryLogFields(errorInfo: ErrorInfo) {
  return {
    status: errorInfo.status,
    code: errorInfo.code,
    reason: errorInfo.reason,
    googleErrorStatus: errorInfo.googleErrorStatus,
    errorMessage: trimErrorMessage(errorInfo.errorMessage),
    isFetchError: isFetchError(errorInfo),
  };
}

export function getRetryAfterHeader(error: unknown): string | undefined {
  const err = toRecord(error);
  const cause = toRecord(err.cause ?? err);
  const response = toRecord(cause.response);
  const headers = toRecord(response.headers);
  return headers["retry-after"] as string | undefined;
}

function getFirstErrorValue(
  errors: unknown,
  key: "reason" | "message",
): string | undefined {
  if (!Array.isArray(errors)) return undefined;
  const firstError = errors[0];
  if (!firstError || typeof firstError !== "object") return undefined;
  const value = (firstError as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function getRetryAttemptError(attempt: unknown): unknown {
  const attemptRecord = toRecord(attempt);
  if ("attemptNumber" in attemptRecord && "error" in attemptRecord) {
    return attemptRecord.error;
  }
  return attempt;
}

function getRetryAttemptNumber(attempt: unknown): number {
  const attemptRecord = toRecord(attempt);
  const attemptNumber = attemptRecord.attemptNumber;
  if (typeof attemptNumber !== "number" || Number.isNaN(attemptNumber)) {
    return 1;
  }
  return attemptNumber;
}

function toErrorInstance(error: unknown, fallbackMessage: string): Error {
  if (error instanceof Error) return error;

  const message =
    typeof error === "string" && error.trim()
      ? error
      : fallbackMessage || "Retry aborted";
  const normalizedError = new Error(message);

  if (error && typeof error === "object") {
    Object.assign(normalizedError, error);
  }

  return normalizedError;
}

function getAbortOriginalError(error: unknown): unknown | undefined {
  const errorRecord = toRecord(error);
  if (errorRecord.name !== "AbortError") return undefined;
  if (!("originalError" in errorRecord)) return undefined;
  return errorRecord.originalError;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}
