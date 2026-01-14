import { describe, it, expect, vi, beforeEach } from "vitest";
import { extractLLMErrorInfo, withLLMRetry } from "./retry";

vi.mock("server-only", () => ({}));

vi.mock("@/utils/sleep", () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

function createError(
  message: string,
  props: { status?: number; code?: string } = {},
): Error {
  const error = new Error(message);
  (error as unknown as { cause: typeof props }).cause = props;
  return error;
}

describe("extractLLMErrorInfo", () => {
  describe("rate limit detection", () => {
    it("detects 429 status as rate limit", () => {
      const error = { status: 429, message: "Too many requests" };
      const result = extractLLMErrorInfo(error);

      expect(result.isRateLimit).toBe(true);
      expect(result.retryable).toBe(true);
    });

    it("detects 429 in nested cause", () => {
      const error = { cause: { status: 429, message: "Rate limited" } };
      const result = extractLLMErrorInfo(error);

      expect(result.isRateLimit).toBe(true);
      expect(result.retryable).toBe(true);
    });

    it("detects OpenAI rate_limit_exceeded code", () => {
      const error = { code: "rate_limit_exceeded", message: "Rate limit" };
      const result = extractLLMErrorInfo(error);

      expect(result.isRateLimit).toBe(true);
      expect(result.retryable).toBe(true);
    });

    it("detects Anthropic rate_limit_error code", () => {
      const error = { code: "rate_limit_error", message: "Rate limit" };
      const result = extractLLMErrorInfo(error);

      expect(result.isRateLimit).toBe(true);
      expect(result.retryable).toBe(true);
    });

    it("detects Google RESOURCE_EXHAUSTED code", () => {
      const error = { code: "RESOURCE_EXHAUSTED", message: "Quota exceeded" };
      const result = extractLLMErrorInfo(error);

      expect(result.isRateLimit).toBe(true);
      expect(result.retryable).toBe(true);
    });

    it("detects rate limit in error message", () => {
      const error = { message: "You have hit a rate limit" };
      const result = extractLLMErrorInfo(error);

      expect(result.isRateLimit).toBe(true);
      expect(result.retryable).toBe(true);
    });

    it("detects quota exceeded in error message", () => {
      const error = { message: "Quota exceeded for this API key" };
      const result = extractLLMErrorInfo(error);

      expect(result.isRateLimit).toBe(true);
      expect(result.retryable).toBe(true);
    });

    it("detects too many requests in error message", () => {
      const error = { message: "Too many requests, please slow down" };
      const result = extractLLMErrorInfo(error);

      expect(result.isRateLimit).toBe(true);
      expect(result.retryable).toBe(true);
    });
  });

  describe("server error detection", () => {
    it("detects 500 as server error", () => {
      const error = { status: 500, message: "Internal server error" };
      const result = extractLLMErrorInfo(error);

      expect(result.isRateLimit).toBe(false);
      expect(result.retryable).toBe(true);
    });

    it("detects 502 as server error", () => {
      const error = { status: 502, message: "Bad gateway" };
      const result = extractLLMErrorInfo(error);

      expect(result.retryable).toBe(true);
    });

    it("detects 503 as server error", () => {
      const error = { status: 503, message: "Service unavailable" };
      const result = extractLLMErrorInfo(error);

      expect(result.retryable).toBe(true);
    });

    it("detects 504 as server error", () => {
      const error = { status: 504, message: "Gateway timeout" };
      const result = extractLLMErrorInfo(error);

      expect(result.retryable).toBe(true);
    });

    it("detects internal error in message", () => {
      const error = { message: "An internal error occurred" };
      const result = extractLLMErrorInfo(error);

      expect(result.retryable).toBe(true);
    });
  });

  describe("non-retryable errors", () => {
    it("does not retry 400 bad request", () => {
      const error = { status: 400, message: "Invalid request" };
      const result = extractLLMErrorInfo(error);

      expect(result.retryable).toBe(false);
    });

    it("does not retry 401 unauthorized", () => {
      const error = { status: 401, message: "Invalid API key" };
      const result = extractLLMErrorInfo(error);

      expect(result.retryable).toBe(false);
    });

    it("does not retry 403 forbidden", () => {
      const error = { status: 403, message: "Access denied" };
      const result = extractLLMErrorInfo(error);

      expect(result.retryable).toBe(false);
    });
  });

  describe("retry-after extraction", () => {
    it("extracts retry-after header in seconds", () => {
      const error = {
        status: 429,
        cause: {
          response: {
            headers: { "retry-after": "30" },
          },
        },
      };
      const result = extractLLMErrorInfo(error);

      expect(result.retryAfterMs).toBe(30_000);
    });

    it("extracts x-ratelimit-reset-requests header", () => {
      const error = {
        status: 429,
        cause: {
          response: {
            headers: { "x-ratelimit-reset-requests": "60" },
          },
        },
      };
      const result = extractLLMErrorInfo(error);

      expect(result.retryAfterMs).toBe(60_000);
    });

    it("extracts retry time from error message", () => {
      const error = {
        status: 429,
        message: "Rate limited. Retry after 45 seconds",
      };
      const result = extractLLMErrorInfo(error);

      expect(result.retryAfterMs).toBe(45_000);
    });

    it("returns undefined retryAfterMs when no retry info", () => {
      const error = { status: 429, message: "Rate limited" };
      const result = extractLLMErrorInfo(error);

      expect(result.retryAfterMs).toBeUndefined();
    });
  });
});

describe("withLLMRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns result on first successful attempt", async () => {
    const fn = vi.fn().mockResolvedValue("success");

    const result = await withLLMRetry(fn, { label: "test" });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("retries on rate limit error and succeeds", async () => {
    const rateLimitError = createError("Rate limited", { status: 429 });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce("success after retry");

    const result = await withLLMRetry(fn, { label: "test" });

    expect(result).toBe("success after retry");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("retries on server error and succeeds", async () => {
    const serverError = createError("Service unavailable", { status: 503 });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(serverError)
      .mockResolvedValueOnce("success after retry");

    const result = await withLLMRetry(fn, { label: "test" });

    expect(result).toBe("success after retry");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("throws immediately on non-retryable errors", async () => {
    const authError = createError("Invalid API key", { status: 401 });
    const fn = vi.fn().mockRejectedValue(authError);

    await expect(withLLMRetry(fn, { label: "test" })).rejects.toMatchObject({
      error: { message: "Invalid API key" },
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("uses custom maxRetries", async () => {
    const rateLimitError = createError("Rate limited", { status: 429 });
    const fn = vi.fn().mockRejectedValue(rateLimitError);

    await expect(
      withLLMRetry(fn, { label: "test", maxRetries: 1 }),
    ).rejects.toThrow("Rate limited");

    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("calls sleep with delay on retry", async () => {
    const { sleep } = await import("@/utils/sleep");
    const rateLimitError = createError("Rate limited", { status: 429 });
    const fn = vi
      .fn()
      .mockRejectedValueOnce(rateLimitError)
      .mockResolvedValueOnce("success");

    await withLLMRetry(fn, { label: "test" });

    expect(sleep).toHaveBeenCalled();
  });
});
