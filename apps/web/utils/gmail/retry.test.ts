import { describe, it, expect } from "vitest";
import { isRetryableError, calculateRetryDelay } from "./retry";

describe("Gmail retry helpers", () => {
  describe("isRetryableError", () => {
    it("should identify 502 status code as retryable server error", () => {
      const errorInfo = { status: 502, errorMessage: "Server Error" };
      const result = isRetryableError(errorInfo);

      expect(result.retryable).toBe(true);
      expect(result.isServerError).toBe(true);
      expect(result.isRateLimit).toBe(false);
    });

    it("should identify 502 in error message as retryable (Gmail HTML error)", () => {
      const errorInfo = {
        errorMessage: "Error 502 (Server Error)!!1",
      };
      const result = isRetryableError(errorInfo);

      expect(result.retryable).toBe(true);
      expect(result.isServerError).toBe(true);
      expect(result.isRateLimit).toBe(false);
    });

    it("should identify 503 in error message as retryable", () => {
      const errorInfo = {
        errorMessage: "503 Service Unavailable",
      };
      const result = isRetryableError(errorInfo);

      expect(result.retryable).toBe(true);
      expect(result.isServerError).toBe(true);
      expect(result.isRateLimit).toBe(false);
    });

    it("should identify 504 Gateway Timeout as retryable", () => {
      const errorInfo = { status: 504, errorMessage: "Gateway Timeout" };
      const result = isRetryableError(errorInfo);

      expect(result.retryable).toBe(true);
      expect(result.isServerError).toBe(true);
      expect(result.isRateLimit).toBe(false);
    });

    it("should identify 429 as a retryable rate limit error", () => {
      const errorInfo = { status: 429, errorMessage: "Too Many Requests" };
      const result = isRetryableError(errorInfo);

      expect(result.retryable).toBe(true);
      expect(result.isRateLimit).toBe(true);
      expect(result.isServerError).toBe(false);
    });

    it("should identify 403 with rateLimitExceeded reason as retryable", () => {
      const errorInfo = {
        status: 403,
        reason: "rateLimitExceeded",
        errorMessage: "Rate limit exceeded",
      };
      const result = isRetryableError(errorInfo);

      expect(result.retryable).toBe(true);
      expect(result.isRateLimit).toBe(true);
      expect(result.isServerError).toBe(false);
    });

    it("should identify 404 as non-retryable", () => {
      const errorInfo = { status: 404, errorMessage: "Not Found" };
      const result = isRetryableError(errorInfo);

      expect(result.retryable).toBe(false);
      expect(result.isRateLimit).toBe(false);
      expect(result.isServerError).toBe(false);
    });

    it("should identify 403 without rate limit reason as non-retryable", () => {
      const errorInfo = {
        status: 403,
        reason: "forbidden",
        errorMessage: "Forbidden",
      };
      const result = isRetryableError(errorInfo);

      expect(result.retryable).toBe(false);
      expect(result.isRateLimit).toBe(false);
      expect(result.isServerError).toBe(false);
    });
  });

  describe("calculateRetryDelay", () => {
    it("should return 30 seconds for rate limit errors", () => {
      const delay = calculateRetryDelay(true, false, 1);
      expect(delay).toBe(30_000);
    });

    it("should use exponential backoff for server errors", () => {
      expect(calculateRetryDelay(false, true, 1)).toBe(5000); // 5s
      expect(calculateRetryDelay(false, true, 2)).toBe(10_000); // 10s
      expect(calculateRetryDelay(false, true, 3)).toBe(20_000); // 20s
    });
  });
});
