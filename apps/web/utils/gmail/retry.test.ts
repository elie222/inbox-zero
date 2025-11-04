import { describe, it, expect } from "vitest";
import {
  extractErrorInfo,
  isRetryableError,
  calculateRetryDelay,
} from "./retry";

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

    it("should use fallback delay when retry time is in the past", () => {
      const pastDate = new Date(Date.now() - 10_000).toISOString();
      const errorMessage = `Rate limit exceeded. Retry after ${pastDate}`;

      // Should fall back to 30s for rate limit
      const delay = calculateRetryDelay(
        true,
        false,
        1,
        undefined,
        errorMessage,
      );
      expect(delay).toBe(30_000);
    });

    it("should use fallback delay when Retry-After header is stale", () => {
      // Use HTTP-date format (like "Wed, 21 Oct 2015 07:28:00 GMT")
      const pastDate = new Date(Date.now() - 5000).toUTCString();

      // Should fall back to exponential backoff for server error
      const delay = calculateRetryDelay(false, true, 2, pastDate);
      expect(delay).toBe(10_000); // 2nd attempt = 10s
    });

    it("should use retry time from error message when valid", () => {
      const futureDate = new Date(Date.now() + 15_000).toISOString();
      const errorMessage = `Rate limit exceeded. Retry after ${futureDate}`;

      const delay = calculateRetryDelay(
        true,
        false,
        1,
        undefined,
        errorMessage,
      );
      expect(delay).toBeGreaterThan(14_000); // Should be ~15s
      expect(delay).toBeLessThan(16_000);
    });
  });

  describe("extractErrorInfo", () => {
    it("should extract Gmail error details from response payload", () => {
      const error = {
        cause: {
          response: {
            status: 404,
            data: {
              error: {
                message: "Invalid label: FAKE_LABEL_ID_123",
                errors: [{ reason: "notFound" }],
              },
            },
          },
        },
      };

      const info = extractErrorInfo(error);

      expect(info.status).toBe(404);
      expect(info.reason).toBe("notFound");
      expect(info.errorMessage).toBe("Invalid label: FAKE_LABEL_ID_123");
    });

    it("should fall back to top-level error string when message missing", () => {
      const error = {
        error: "Some top-level error",
      };

      const info = extractErrorInfo(error);

      expect(info.status).toBeUndefined();
      expect(info.reason).toBeUndefined();
      expect(info.errorMessage).toBe("Some top-level error");
    });
  });
});
