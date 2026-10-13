import type { Logger } from "@/utils/logger";
import { isFetchError } from "@/utils/retry/is-fetch-error";
import { getRetryAfterHeaderFromError } from "@/utils/retry/get-retry-after-header";
import {
  getRetryAfterDelayMs,
  type ProviderRetryPolicy,
  withProviderRetry,
} from "@/utils/retry/provider-retry";

interface ErrorInfo {
  code?: string;
  errorMessage: string;
  responseBody?: string;
  status?: number;
}

// Intentionally lower than Microsoft's common 30s throttle backoff so serverless
// requests fail fast instead of sleeping into function timeout budgets.
// Non-serverless callers can pass a higher maxBlockingDelayMs when needed.
export const MAX_MICROSOFT_GRAPH_BLOCKING_RETRY_DELAY_MS = 10_000;

/**
 * Retries a Microsoft Graph API operation when rate limits or temporary server errors are encountered
 * - Rate limits: 429, "TooManyRequests", "ApplicationThrottled", "MailboxConcurrency"
 * - Server errors: 502, 503, 504, "ServiceNotAvailable", "ServerBusy"
 */
export async function withMicrosoftGraphRetry<T>(
  operation: () => Promise<T>,
  logger: Logger,
  maxRetries = 5,
  maxBlockingDelayMs = MAX_MICROSOFT_GRAPH_BLOCKING_RETRY_DELAY_MS,
): Promise<T> {
  return withMicrosoftGraphRetryPolicy(
    operation,
    logger,
    maxRetries,
    maxBlockingDelayMs,
    "all",
  );
}

/**
 * Retries a non-idempotent Microsoft Graph write only when Graph explicitly
 * rejects it because of throttling. Network, server, and conflict failures are
 * ambiguous because the write may already have succeeded.
 */
export async function withMicrosoftGraphWriteRetry<T>(
  operation: () => Promise<T>,
  logger: Logger,
  maxRetries = 5,
  maxBlockingDelayMs = MAX_MICROSOFT_GRAPH_BLOCKING_RETRY_DELAY_MS,
): Promise<T> {
  return withMicrosoftGraphRetryPolicy(
    operation,
    logger,
    maxRetries,
    maxBlockingDelayMs,
    "rate-limit-only",
  );
}

/**
 * Extracts error information from Microsoft Graph API errors
 */
export function extractErrorInfo(error: unknown): ErrorInfo {
  const err = error as Record<string, unknown>;
  const nestedError = err?.error as Record<string, unknown> | undefined;

  const status =
    (err?.statusCode as number) ??
    (err?.status as number) ??
    ((err?.response as Record<string, unknown>)?.status as number) ??
    (nestedError?.statusCode as number) ??
    (nestedError?.status as number) ??
    ((nestedError?.response as Record<string, unknown>)?.status as number) ??
    undefined;

  const code =
    (err?.code as string) ?? (nestedError?.code as string) ?? undefined;

  const primaryMessage =
    (err?.message as string) ??
    (nestedError?.message as string) ??
    (err?.body as string) ??
    "";

  const errorMessage = String(primaryMessage);

  const responseBody =
    typeof err?.body === "string" ? (err.body as string) : undefined;

  return { status, code, errorMessage, responseBody };
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

  // Rate limit detection: 429 status, throttling codes, or rate limit messages
  const isRateLimit =
    status === 429 ||
    code === "TooManyRequests" ||
    code === "ApplicationThrottled" ||
    /rate limit/i.test(errorMessage) ||
    /MailboxConcurrency/i.test(errorMessage);

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

  // Graph sometimes ends a 200 response mid-body; the same read succeeds on retry.
  const isTruncatedResponse = status === 200 && code === "SyntaxError";

  return {
    retryable:
      isRateLimit ||
      isServerError ||
      isConflictError ||
      isTruncatedResponse ||
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
  const retryAfterDelayMs = getRetryAfterDelayMs(retryAfterHeader);
  if (retryAfterDelayMs !== undefined) return retryAfterDelayMs;

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

async function withMicrosoftGraphRetryPolicy<T>(
  operation: () => Promise<T>,
  logger: Logger,
  maxRetries: number,
  maxBlockingDelayMs: number,
  retryPolicy: ProviderRetryPolicy,
): Promise<T> {
  return withProviderRetry(operation, {
    providerName: "Microsoft Graph",
    logger,
    maxRetries,
    maxBlockingDelayMs,
    retryPolicy,
    classify: (attempt) => {
      const errorInfo = extractErrorInfo(attempt);
      const { retryable, isRateLimit, isServerError, isConflictError } =
        isRetryableError(errorInfo);
      const retryAfterHeader = getRetryAfterHeaderFromError(attempt);

      return {
        retryable,
        isRateLimit,
        delayMs: calculateRetryDelay(
          isRateLimit,
          isServerError,
          isConflictError,
          attempt.attemptNumber,
          retryAfterHeader,
        ),
        logFields: {
          status: errorInfo.status,
          code: errorInfo.code,
          isRateLimit,
          isServerError,
          isConflictError,
          isFetchError: isFetchError(errorInfo),
          retryAfterHeader,
          responseBody: errorInfo.responseBody,
        },
      };
    },
  });
}
