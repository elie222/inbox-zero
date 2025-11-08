import { describe, it, expect } from "vitest";
import {
  extractErrorInfo,
  isRetryableError,
  calculateRetryDelay,
} from "./retry";

describe("extractErrorInfo", () => {
  it("extracts status from statusCode", () => {
    const error = { statusCode: 429, message: "Too many requests" };
    const info = extractErrorInfo(error);
    expect(info.status).toBe(429);
    expect(info.errorMessage).toBe("Too many requests");
  });

  it("extracts code from error.code", () => {
    const error = {
      code: "TooManyRequests",
      message: "Rate limit exceeded",
    };
    const info = extractErrorInfo(error);
    expect(info.code).toBe("TooManyRequests");
    expect(info.errorMessage).toBe("Rate limit exceeded");
  });

  it("extracts nested error structure", () => {
    const error = {
      error: {
        code: "ServiceNotAvailable",
        message: "Service temporarily unavailable",
      },
      statusCode: 503,
    };
    const info = extractErrorInfo(error);
    expect(info.status).toBe(503);
    expect(info.code).toBe("ServiceNotAvailable");
    expect(info.errorMessage).toBe("Service temporarily unavailable");
  });

  it("handles response object", () => {
    const error = {
      response: {
        status: 429,
      },
      message: "Rate limited",
    };
    const info = extractErrorInfo(error);
    expect(info.status).toBe(429);
    expect(info.errorMessage).toBe("Rate limited");
  });
});

describe("isRetryableError", () => {
  it("identifies 429 as rate limit", () => {
    const errorInfo = { status: 429, errorMessage: "Too many requests" };
    const result = isRetryableError(errorInfo);
    expect(result.isRateLimit).toBe(true);
    expect(result.retryable).toBe(true);
  });

  it("identifies TooManyRequests code as rate limit", () => {
    const errorInfo = {
      code: "TooManyRequests",
      errorMessage: "Rate limit exceeded",
    };
    const result = isRetryableError(errorInfo);
    expect(result.isRateLimit).toBe(true);
    expect(result.retryable).toBe(true);
  });

  it("identifies server errors", () => {
    for (const status of [502, 503, 504]) {
      const errorInfo = { status, errorMessage: "Server error" };
      const result = isRetryableError(errorInfo);
      expect(result.isServerError).toBe(true);
      expect(result.retryable).toBe(true);
    }
  });

  it("identifies ServiceNotAvailable code as server error", () => {
    const errorInfo = {
      code: "ServiceNotAvailable",
      errorMessage: "Service unavailable",
    };
    const result = isRetryableError(errorInfo);
    expect(result.isServerError).toBe(true);
    expect(result.retryable).toBe(true);
  });

  it("identifies ServerBusy code as server error", () => {
    const errorInfo = { code: "ServerBusy", errorMessage: "Server busy" };
    const result = isRetryableError(errorInfo);
    expect(result.isServerError).toBe(true);
    expect(result.retryable).toBe(true);
  });

  it("identifies non-retryable errors", () => {
    const errorInfo = { status: 404, errorMessage: "Not found" };
    const result = isRetryableError(errorInfo);
    expect(result.retryable).toBe(false);
    expect(result.isRateLimit).toBe(false);
    expect(result.isServerError).toBe(false);
  });

  it("identifies rate limit by message pattern", () => {
    const errorInfo = { status: 403, errorMessage: "Rate limit exceeded" };
    const result = isRetryableError(errorInfo);
    expect(result.isRateLimit).toBe(true);
    expect(result.retryable).toBe(true);
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

  it("uses exponential backoff for server errors", () => {
    expect(calculateRetryDelay(false, true, false, 1)).toBe(5000); // 5s
    expect(calculateRetryDelay(false, true, false, 2)).toBe(10_000); // 10s
    expect(calculateRetryDelay(false, true, false, 3)).toBe(20_000); // 20s
    expect(calculateRetryDelay(false, true, false, 4)).toBe(40_000); // 40s
    expect(calculateRetryDelay(false, true, false, 5)).toBe(80_000); // 80s max
    expect(calculateRetryDelay(false, true, false, 6)).toBe(80_000); // capped at 80s
  });

  it("uses exponential backoff for conflict errors", () => {
    expect(calculateRetryDelay(false, false, true, 1)).toBe(500); // 500ms
    expect(calculateRetryDelay(false, false, true, 2)).toBe(1000); // 1s
    expect(calculateRetryDelay(false, false, true, 3)).toBe(2000); // 2s
    expect(calculateRetryDelay(false, false, true, 4)).toBe(4000); // 4s
    expect(calculateRetryDelay(false, false, true, 5)).toBe(8000); // 8s max
    expect(calculateRetryDelay(false, false, true, 6)).toBe(8000); // capped at 8s
  });

  it("returns 0 for non-retryable errors", () => {
    const delay = calculateRetryDelay(false, false, false, 1);
    expect(delay).toBe(0);
  });
});
