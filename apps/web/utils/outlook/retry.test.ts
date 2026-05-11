import { describe, it, expect, vi } from "vitest";
import { createTestLogger } from "@/__tests__/helpers";
import {
  extractErrorInfo,
  isRetryableError,
  calculateRetryDelay,
  withOutlookRetry,
} from "./retry";

describe("extractErrorInfo", () => {
  it.each([
    {
      name: "status from statusCode",
      error: { statusCode: 429, message: "Too many requests" },
      expected: { status: 429, errorMessage: "Too many requests" },
    },
    {
      name: "code from error.code",
      error: {
        code: "TooManyRequests",
        message: "Rate limit exceeded",
      },
      expected: {
        code: "TooManyRequests",
        errorMessage: "Rate limit exceeded",
      },
    },
    {
      name: "nested error structure",
      error: {
        error: {
          code: "ServiceNotAvailable",
          message: "Service temporarily unavailable",
        },
        statusCode: 503,
      },
      expected: {
        status: 503,
        code: "ServiceNotAvailable",
        errorMessage: "Service temporarily unavailable",
      },
    },
    {
      name: "response object",
      error: {
        response: {
          status: 429,
        },
        message: "Rate limited",
      },
      expected: { status: 429, errorMessage: "Rate limited" },
    },
  ])("extracts $name", ({ error, expected }) => {
    expect(extractErrorInfo(error)).toMatchObject(expected);
  });
});

describe("isRetryableError", () => {
  it.each([
    {
      name: "429 status as rate limit",
      errorInfo: { status: 429, errorMessage: "Too many requests" },
      expected: { isRateLimit: true, retryable: true },
    },
    {
      name: "TooManyRequests code as rate limit",
      errorInfo: {
        code: "TooManyRequests",
        errorMessage: "Rate limit exceeded",
      },
      expected: { isRateLimit: true, retryable: true },
    },
    {
      name: "ApplicationThrottled code as rate limit",
      errorInfo: {
        code: "ApplicationThrottled",
        errorMessage: "Application is over its MailboxConcurrency limit.",
      },
      expected: { isRateLimit: true, retryable: true },
    },
    {
      name: "MailboxConcurrency message as rate limit",
      errorInfo: {
        status: 429,
        errorMessage: "MailboxConcurrency limit exceeded",
      },
      expected: { isRateLimit: true, retryable: true },
    },
    {
      name: "502 status as server error",
      errorInfo: { status: 502, errorMessage: "Server error" },
      expected: { isServerError: true, retryable: true },
    },
    {
      name: "503 status as server error",
      errorInfo: { status: 503, errorMessage: "Server error" },
      expected: { isServerError: true, retryable: true },
    },
    {
      name: "504 status as server error",
      errorInfo: { status: 504, errorMessage: "Server error" },
      expected: { isServerError: true, retryable: true },
    },
    {
      name: "ServiceNotAvailable code as server error",
      errorInfo: {
        code: "ServiceNotAvailable",
        errorMessage: "Service unavailable",
      },
      expected: { isServerError: true, retryable: true },
    },
    {
      name: "ServerBusy code as server error",
      errorInfo: { code: "ServerBusy", errorMessage: "Server busy" },
      expected: { isServerError: true, retryable: true },
    },
    {
      name: "412 status as conflict error",
      errorInfo: { status: 412, errorMessage: "Precondition failed" },
      expected: { isConflictError: true, retryable: true },
    },
    {
      name: "ErrorIrresolvableConflict code as conflict error",
      errorInfo: {
        code: "ErrorIrresolvableConflict",
        errorMessage: "Change key conflict",
      },
      expected: { isConflictError: true, retryable: true },
    },
    {
      name: "conflict by message pattern",
      errorInfo: {
        status: 409,
        errorMessage: "The change key passed does not match",
      },
      expected: { isConflictError: true, retryable: true },
    },
    {
      name: "fetch failed as network error",
      errorInfo: { errorMessage: "fetch failed" },
      expected: {
        retryable: true,
        isRateLimit: false,
        isServerError: false,
        isConflictError: false,
      },
    },
    {
      name: "non-retryable errors",
      errorInfo: { status: 404, errorMessage: "Not found" },
      expected: {
        retryable: false,
        isRateLimit: false,
        isServerError: false,
        isConflictError: false,
      },
    },
    {
      name: "rate limit by message pattern",
      errorInfo: { status: 403, errorMessage: "Rate limit exceeded" },
      expected: { isRateLimit: true, retryable: true },
    },
  ])("identifies $name", ({ errorInfo, expected }) => {
    expect(isRetryableError(errorInfo)).toMatchObject(expected);
  });
});

describe("calculateRetryDelay", () => {
  it("uses Retry-After header in seconds", () => {
    const delay = calculateRetryDelay(true, false, false, 1, "10");
    expect(delay).toBe(10_000); // 10 seconds in ms
  });

  it("uses Retry-After header as HTTP-date", () => {
    const futureDate = new Date(Date.now() + 5000);
    const delay = calculateRetryDelay(
      true,
      false,
      false,
      1,
      futureDate.toUTCString(),
    );
    expect(delay).toBeGreaterThanOrEqual(4000);
    expect(delay).toBeLessThanOrEqual(5000);
  });

  it("falls back to 30s for rate limits without header", () => {
    const delay = calculateRetryDelay(true, false, false, 1);
    expect(delay).toBe(30_000);
  });

  it.each([
    {
      name: "server errors",
      args: [false, true, false] as const,
      expectedDelays: [5000, 10_000, 20_000, 40_000, 80_000, 80_000],
    },
    {
      name: "conflict errors",
      args: [false, false, true] as const,
      expectedDelays: [500, 1000, 2000, 4000, 8000, 8000],
    },
    {
      name: "other retryable errors",
      args: [false, false, false] as const,
      expectedDelays: [1000, 2000, 4000, 8000, 16_000, 16_000],
    },
  ])("uses exponential backoff for $name", ({ args, expectedDelays }) => {
    for (const [index, expectedDelay] of expectedDelays.entries()) {
      expect(calculateRetryDelay(...args, index + 1)).toBe(expectedDelay);
    }
  });
});

describe("withOutlookRetry", () => {
  it("aborts retries when backoff exceeds max blocking delay", async () => {
    const operation = vi.fn().mockRejectedValue(
      Object.assign(new Error("Throttled"), {
        code: "ApplicationThrottled",
        statusCode: 429,
      }),
    );

    await expect(
      withOutlookRetry(operation, createTestLogger(), 5, 1),
    ).rejects.toBeDefined();

    expect(operation).toHaveBeenCalledTimes(1);
  });
});
