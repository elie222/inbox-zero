import { describe, it, expect, vi, beforeEach } from "vitest";
import { isTransientNetworkError, withNetworkRetry } from "./retry";

vi.mock("server-only", () => ({}));

// Mock sleep to avoid waiting in tests
vi.mock("@/utils/sleep", () => ({
  sleep: vi.fn().mockResolvedValue(undefined),
}));

describe("isTransientNetworkError", () => {
  it("should return true for ECONNRESET error", () => {
    const error = {
      cause: {
        code: "ECONNRESET",
        message: "read ECONNRESET",
      },
    };
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it("should return true for ETIMEDOUT error", () => {
    const error = {
      cause: {
        code: "ETIMEDOUT",
        message: "connect ETIMEDOUT",
      },
    };
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it("should return true for ECONNREFUSED error", () => {
    const error = {
      cause: {
        code: "ECONNREFUSED",
        message: "connect ECONNREFUSED",
      },
    };
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it("should return true for 'fetch failed' error", () => {
    const error = {
      message: "fetch failed",
    };
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it("should return true for 'terminated' error", () => {
    const error = {
      message: "terminated",
      name: "TypeError",
    };
    expect(isTransientNetworkError(error)).toBe(true);
  });

  it("should return true for nested network error (AI SDK format with Error instances)", () => {
    // This is the actual format from the AI SDK - using real Error instances
    const innerCause = new Error("read ECONNRESET");
    (innerCause as NodeJS.ErrnoException).code = "ECONNRESET";

    const middleCause = new TypeError("terminated");
    middleCause.cause = innerCause;

    const error = new Error("Failed to process successful response");
    error.name = "AI_APICallError";
    error.cause = middleCause;

    expect(isTransientNetworkError(error)).toBe(true);
  });

  it("should return false for non-network errors", () => {
    const error = {
      message: "Invalid API key",
      code: "invalid_api_key",
    };
    expect(isTransientNetworkError(error)).toBe(false);
  });

  it("should return false for rate limit errors", () => {
    const error = {
      message: "Rate limit exceeded",
      statusCode: 429,
    };
    expect(isTransientNetworkError(error)).toBe(false);
  });
});

describe("withNetworkRetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should return result on first successful attempt", async () => {
    const fn = vi.fn().mockResolvedValue("success");

    const result = await withNetworkRetry(fn, { label: "test" });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should retry on transient network error and succeed", async () => {
    const networkError = {
      cause: { code: "ECONNRESET", message: "read ECONNRESET" },
    };
    const fn = vi
      .fn()
      .mockRejectedValueOnce(networkError)
      .mockResolvedValueOnce("success after retry");

    const result = await withNetworkRetry(fn, { label: "test" });

    expect(result).toBe("success after retry");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should retry up to MAX_RETRIES times", async () => {
    const networkError = {
      cause: { code: "ECONNRESET", message: "read ECONNRESET" },
    };
    const fn = vi.fn().mockRejectedValue(networkError);

    await expect(withNetworkRetry(fn, { label: "test" })).rejects.toEqual(
      networkError,
    );

    // Initial attempt + MAX_RETRIES (2) = 3 total attempts
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("should throw immediately on non-retryable errors", async () => {
    const nonRetryableError = {
      message: "Invalid API key",
      code: "invalid_api_key",
    };
    const fn = vi.fn().mockRejectedValue(nonRetryableError);

    await expect(withNetworkRetry(fn, { label: "test" })).rejects.toEqual(
      nonRetryableError,
    );

    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("should use custom shouldRetry callback", async () => {
    const customError = { type: "validation_error" };
    const fn = vi
      .fn()
      .mockRejectedValueOnce(customError)
      .mockResolvedValueOnce("success");

    const result = await withNetworkRetry(fn, {
      label: "test",
      shouldRetry: (error: unknown) =>
        (error as { type?: string }).type === "validation_error",
    });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it("should retry on both network errors and custom shouldRetry", async () => {
    const networkError = {
      cause: { code: "ECONNRESET" },
    };
    const customError = { type: "validation_error" };
    const fn = vi
      .fn()
      .mockRejectedValueOnce(networkError)
      .mockRejectedValueOnce(customError)
      .mockResolvedValueOnce("success");

    const result = await withNetworkRetry(fn, {
      label: "test",
      shouldRetry: (error: unknown) =>
        (error as { type?: string }).type === "validation_error",
    });

    expect(result).toBe("success");
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it("should call sleep with exponential backoff delays", async () => {
    const { sleep } = await import("@/utils/sleep");
    const networkError = {
      cause: { code: "ECONNRESET" },
    };
    const fn = vi.fn().mockRejectedValue(networkError);

    await expect(withNetworkRetry(fn, { label: "test" })).rejects.toEqual(
      networkError,
    );

    // Should have slept twice (after first and second attempts, before giving up on third)
    expect(sleep).toHaveBeenCalledTimes(2);
    expect(sleep).toHaveBeenNthCalledWith(1, 1000); // 1s
    expect(sleep).toHaveBeenNthCalledWith(2, 2000); // 2s
  });
});
