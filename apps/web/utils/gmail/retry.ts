import { createScopedLogger, type Logger } from "@/utils/logger";
import { isFetchError } from "@/utils/retry/is-fetch-error";
import { getRetryAfterHeaderFromError } from "@/utils/retry/get-retry-after-header";
import {
  getRetryAfterDelayMs,
  type ProviderRetryPolicy,
  withProviderRetry,
} from "@/utils/retry/provider-retry";

const logger = createScopedLogger("gmail-retry");
export const MAX_GMAIL_BLOCKING_RETRY_DELAY_MS = 10_000;

interface RetryLogContext {
  logger?: Logger;
}

interface ErrorInfo {
  code?: string;
  errorMessage: string;
  googleErrorStatus?: string;
  reason?: string;
  status?: number;
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
  return withGmailRetryPolicy(operation, maxRetries, context, "all");
}

/** Retries ambiguous sends only when Gmail explicitly rejected them for throttling. */
export async function withGmailNonIdempotentWriteRetry<T>(
  operation: () => Promise<T>,
  maxRetries = 5,
  context?: RetryLogContext,
): Promise<T> {
  return withGmailRetryPolicy(
    operation,
    maxRetries,
    context,
    "rate-limit-only",
  );
}

async function withGmailRetryPolicy<T>(
  operation: () => Promise<T>,
  maxRetries: number,
  context: RetryLogContext | undefined,
  retryPolicy: ProviderRetryPolicy,
): Promise<T> {
  return withProviderRetry(operation, {
    providerName: "Gmail",
    logger: context?.logger || logger,
    maxRetries,
    maxBlockingDelayMs: MAX_GMAIL_BLOCKING_RETRY_DELAY_MS,
    retryPolicy,
    classify: (attempt) => {
      const errorInfo = extractErrorInfo(attempt.error);
      const { retryable, isRateLimit, isServerError, isFailedPrecondition } =
        isRetryableError(errorInfo);
      const retryAfterHeader = getRetryAfterHeaderFromError(attempt.error);

      return {
        retryable,
        isRateLimit,
        delayMs: calculateRetryDelay(
          isRateLimit,
          isServerError,
          isFailedPrecondition,
          attempt.attemptNumber,
          retryAfterHeader,
          errorInfo.errorMessage,
        ),
        logFields: {
          ...buildRetryLogFields(errorInfo),
          retryAfterHeader,
          retryAfterFromMessage: parseRetryTime(
            errorInfo.errorMessage,
          )?.toISOString(),
          isRateLimit,
          isServerError,
          isFailedPrecondition,
        },
      };
    },
  });
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
  const status = getNumericStatus(
    cause.status,
    cause.code,
    response.status,
    responseError.code,
    err.code,
  );
  const code = getCodeValue(err.code, cause.code, responseError.code);
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
  const { status, reason, errorMessage, googleErrorStatus } = errorInfo;
  const hasExistingPushClient = isExistingGmailPushClientError(errorInfo);

  // Broad rate-limit detection: 429, 403 + known reasons, or well-known messages
  const isRateLimit =
    status === 429 ||
    googleErrorStatus === "RESOURCE_EXHAUSTED" ||
    (status === 403 &&
      ["rateLimitExceeded", "userRateLimitExceeded", "quotaExceeded"].includes(
        String(reason),
      )) ||
    /(^|[\s-])rate limit exceeded/i.test(errorMessage) ||
    /user-rate limit exceeded/i.test(errorMessage) ||
    /quota exceeded/i.test(errorMessage) ||
    /resource exhausted/i.test(errorMessage) ||
    /too many concurrent requests for user/i.test(errorMessage);

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
    !hasExistingPushClient &&
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

export function isExistingGmailPushClientError(errorInfo: {
  errorMessage: string;
  status?: number;
}): boolean {
  return (
    errorInfo.status === 400 &&
    /only one user push notification client allowed per developer/i.test(
      errorInfo.errorMessage,
    )
  );
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

  const retryAfterDelayMs = getRetryAfterDelayMs(retryAfterHeader);
  if (retryAfterDelayMs !== undefined) return retryAfterDelayMs;

  // Use different fallback delays based on error type
  if (isServerError) {
    // Exponential backoff for server errors: 5s, 10s, 20s, 40s, 80s
    return Math.min(5000 * 2 ** (attemptNumber - 1), 80_000);
  }

  if (isRateLimit) {
    // Short exponential backoff keeps retries within request lifetimes unless Gmail provides an explicit retry time.
    return Math.min(1000 * 2 ** (attemptNumber - 1), 10_000);
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
  if (!trimmed) return;
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

function getFirstErrorValue(
  errors: unknown,
  key: "reason" | "message",
): string | undefined {
  if (!Array.isArray(errors)) return;
  const firstError = errors[0];
  if (!firstError || typeof firstError !== "object") return;
  const value = (firstError as Record<string, unknown>)[key];
  return typeof value === "string" ? value : undefined;
}

function getNumericStatus(...values: unknown[]): number | undefined {
  for (const value of values) {
    const normalized = normalizeNumericValue(value);
    if (normalized !== undefined) return normalized;
  }

  return;
}

function normalizeNumericValue(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }

  return;
}

function getCodeValue(...values: unknown[]): string | undefined {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }

  return;
}

function getRetryAttemptError(attempt: unknown): unknown {
  const attemptRecord = toRecord(attempt);
  if ("attemptNumber" in attemptRecord && "error" in attemptRecord) {
    return attemptRecord.error;
  }
  return attempt;
}

function toRecord(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object") return {};
  return value as Record<string, unknown>;
}
