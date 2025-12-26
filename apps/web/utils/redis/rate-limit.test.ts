import { describe, it, expect, vi, beforeEach } from "vitest";

// Use vi.hoisted() to declare mocks that can be used in vi.mock factories
const { mockBlockUntilReady } = vi.hoisted(() => ({
  mockBlockUntilReady: vi.fn(),
}));

// Mock @upstash/ratelimit before importing the module
vi.mock("@upstash/ratelimit", () => {
  // Create a proper class mock
  class RatelimitMock {
    static slidingWindow = vi.fn();
    blockUntilReady = mockBlockUntilReady;
  }
  return { Ratelimit: RatelimitMock };
});

// Mock redis
vi.mock("@/utils/redis", () => ({
  redis: {},
}));

import { acquireRateLimitToken } from "./rate-limit";

describe("acquireRateLimitToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should successfully acquire token when rate limit allows", async () => {
    mockBlockUntilReady.mockResolvedValue({ success: true });

    await expect(
      acquireRateLimitToken("test-account-id"),
    ).resolves.toBeUndefined();

    expect(mockBlockUntilReady).toHaveBeenCalledWith(
      "test-account-id",
      30_000, // default timeout
    );
  });

  it("should use custom timeout when provided", async () => {
    mockBlockUntilReady.mockResolvedValue({ success: true });

    await acquireRateLimitToken("test-account-id", 60_000);

    expect(mockBlockUntilReady).toHaveBeenCalledWith("test-account-id", 60_000);
  });

  it("should throw error when rate limit timeout is exceeded", async () => {
    mockBlockUntilReady.mockResolvedValue({ success: false });

    await expect(acquireRateLimitToken("test-account-id")).rejects.toThrow(
      "Rate limit timeout after 30000ms for test-account-id",
    );
  });

  it("should throw error with custom timeout in message", async () => {
    mockBlockUntilReady.mockResolvedValue({ success: false });

    await expect(
      acquireRateLimitToken("test-account-id", 5000),
    ).rejects.toThrow("Rate limit timeout after 5000ms for test-account-id");
  });

  it("should use unique identifier for per-account rate limiting", async () => {
    mockBlockUntilReady.mockResolvedValue({ success: true });

    await acquireRateLimitToken("account-123");
    await acquireRateLimitToken("account-456");

    expect(mockBlockUntilReady).toHaveBeenNthCalledWith(
      1,
      "account-123",
      30_000,
    );
    expect(mockBlockUntilReady).toHaveBeenNthCalledWith(
      2,
      "account-456",
      30_000,
    );
  });
});
