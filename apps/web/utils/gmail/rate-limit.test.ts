import { beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "@/utils/redis";
import {
  assertGmailNotRateLimited,
  getGmailRateLimitState,
  GmailRateLimitModeError,
  recordGmailRateLimitFromError,
  setGmailRateLimitState,
  withRateLimitRecording,
} from "./rate-limit";

vi.mock("server-only", () => ({}));

vi.mock("@/utils/redis", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
    del: vi.fn(),
  },
}));

describe("gmail rate-limit state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets and reads redis-backed rate-limit state", async () => {
    const retryAt = new Date(Date.now() + 60_000);
    vi.mocked(redis.get).mockResolvedValueOnce(null);

    await setGmailRateLimitState({
      emailAccountId: "account-1",
      retryAt,
      source: "test",
    });

    expect(redis.set).toHaveBeenCalledWith(
      "gmail-rate-limit:account-1",
      expect.any(String),
      expect.objectContaining({
        ex: expect.any(Number),
      }),
    );

    vi.mocked(redis.get).mockResolvedValueOnce(
      JSON.stringify({
        retryAt: retryAt.toISOString(),
        source: "test",
        detectedAt: new Date().toISOString(),
      }),
    );

    const state = await getGmailRateLimitState({
      emailAccountId: "account-1",
    });

    expect(state?.retryAt.toISOString()).toBe(retryAt.toISOString());
    expect(state?.source).toBe("test");
  });

  it("clears stale rate-limit entries", async () => {
    vi.mocked(redis.get).mockResolvedValueOnce(
      JSON.stringify({
        retryAt: new Date(Date.now() - 5000).toISOString(),
        detectedAt: new Date().toISOString(),
      }),
    );

    const state = await getGmailRateLimitState({
      emailAccountId: "account-1",
    });

    expect(state).toBeNull();
    expect(redis.del).toHaveBeenCalledWith("gmail-rate-limit:account-1");
  });

  it("throws a typed error when account is currently rate-limited", async () => {
    vi.mocked(redis.get).mockResolvedValueOnce(
      JSON.stringify({
        retryAt: new Date(Date.now() + 60_000).toISOString(),
        source: "test",
        detectedAt: new Date().toISOString(),
      }),
    );

    await expect(
      assertGmailNotRateLimited({ emailAccountId: "account-1" }),
    ).rejects.toBeInstanceOf(GmailRateLimitModeError);
  });

  it("records rate-limit mode from gmail retry errors", async () => {
    const retryAt = new Date(Date.now() + 120_000).toISOString();
    vi.mocked(redis.get).mockResolvedValueOnce(null);

    const state = await recordGmailRateLimitFromError({
      emailAccountId: "account-1",
      error: {
        cause: {
          status: 429,
          message: `User-rate limit exceeded. Retry after ${retryAt}`,
        },
      },
      source: "test",
    });

    expect(state).not.toBeNull();
    expect(redis.set).toHaveBeenCalledWith(
      "gmail-rate-limit:account-1",
      expect.any(String),
      expect.objectContaining({
        ex: expect.any(Number),
      }),
    );
  });

  it("records and rethrows from wrapped operations", async () => {
    const retryAt = new Date(Date.now() + 120_000).toISOString();
    const rateLimitError = {
      cause: {
        status: 429,
        message: `User-rate limit exceeded. Retry after ${retryAt}`,
      },
    };
    vi.mocked(redis.get).mockResolvedValueOnce(null);

    await expect(
      withRateLimitRecording(
        {
          emailAccountId: "account-1",
          source: "test-wrapper",
        },
        async () => {
          throw rateLimitError;
        },
      ),
    ).rejects.toBe(rateLimitError);

    expect(redis.set).toHaveBeenCalledWith(
      "gmail-rate-limit:account-1",
      expect.any(String),
      expect.objectContaining({
        ex: expect.any(Number),
      }),
    );
  });
});
