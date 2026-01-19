import "server-only";

import pRetry from "p-retry";
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

interface LLMErrorInfo {
  retryable: boolean;
  isRateLimit: boolean;
  retryAfterMs?: number;
}

/**
 * Extracts error information to detect LLM rate limits across providers.
 * Supports OpenAI, Anthropic, Google, and OpenRouter error formats.
 * Also handles p-retry's FailedAttemptError wrapper.
 */
export function extractLLMErrorInfo(error: unknown): LLMErrorInfo {
  // biome-ignore lint/suspicious/noExplicitAny: error shapes vary across providers
  const err = error as any;
  const original = err?.error ?? err;
  const cause = original?.cause ?? original;

  const status: number | undefined =
    cause?.status ??
    cause?.statusCode ??
    original?.status ??
    original?.statusCode ??
    cause?.response?.status;
  const message: string = cause?.message ?? original?.message ?? "";
  const errorCode: string =
    cause?.code ?? original?.code ?? cause?.error?.type ?? "";

  const isRateLimit =
    status === 429 ||
    errorCode === "rate_limit_exceeded" || // OpenAI
    errorCode === "rate_limit_error" || // Anthropic
    errorCode === "RESOURCE_EXHAUSTED" || // Google
    /rate.?limit/i.test(message) ||
    /quota.?exceeded/i.test(message) ||
    /too.?many.?requests/i.test(message);

  const isServerError =
    status === 500 ||
    status === 502 ||
    status === 503 ||
    status === 504 ||
    /internal.?error/i.test(message) ||
    /server.?error/i.test(message);

  let retryAfterMs: number | undefined;
  const headers =
    cause?.response?.headers ??
    cause?.responseHeaders ??
    original?.responseHeaders;
  const retryAfterHeader: string | undefined =
    headers?.["retry-after"] ?? headers?.["x-ratelimit-reset-requests"];

  if (retryAfterHeader) {
    const seconds = Number.parseInt(retryAfterHeader, 10);
    if (!Number.isNaN(seconds)) {
      retryAfterMs = seconds * 1000;
    } else {
      const retryDate = new Date(retryAfterHeader);
      if (!Number.isNaN(retryDate.getTime())) {
        retryAfterMs = Math.max(0, retryDate.getTime() - Date.now());
      }
    }
  }

  if (!retryAfterMs) {
    const retryMatch = message.match(/retry.?after\s+(\d+)/i);
    if (retryMatch) {
      retryAfterMs = Number.parseInt(retryMatch[1], 10) * 1000;
    }
  }

  return {
    retryable: isRateLimit || isServerError,
    isRateLimit,
    retryAfterMs,
  };
}

/**
 * Retries an LLM operation with exponential backoff on rate limits.
 * Uses p-retry with custom delay calculation that honors Retry-After headers.
 */
export async function withLLMRetry<T>(
  operation: () => Promise<T>,
  options: {
    label: string;
    maxRetries?: number;
  },
): Promise<T> {
  const { label, maxRetries = 3 } = options;

  return pRetry(operation, {
    retries: maxRetries,
    minTimeout: 0,
    onFailedAttempt: async (error) => {
      const errorInfo = extractLLMErrorInfo(error);

      if (!errorInfo.retryable) {
        throw error;
      }

      const baseDelayMs = 2000 * 2 ** (error.attemptNumber - 1);
      const delayMs = errorInfo.retryAfterMs ?? Math.min(baseDelayMs, 60_000);
      const jitter = Math.random() * 0.1 * delayMs;
      const totalDelayMs = delayMs + jitter;

      logger.warn("LLM rate limit error, retrying", {
        label,
        attemptNumber: error.attemptNumber,
        maxRetries,
        delayMs: Math.round(totalDelayMs),
        isRateLimit: errorInfo.isRateLimit,
        retryAfterMs: errorInfo.retryAfterMs,
      });

      await sleep(totalDelayMs);
    },
  });
}
