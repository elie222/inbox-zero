import { beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "@/utils/redis";
import {
  assertProviderNotRateLimited,
  getEmailProviderRateLimitState,
  ProviderRateLimitModeError,
  recordRateLimitFromApiError,
  recordProviderRateLimitFromError,
  setEmailProviderRateLimitState,
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

describe("email provider rate-limit state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sets and reads redis-backed rate-limit state", async () => {
    const retryAt = new Date(Date.now() + 60_000);
    vi.mocked(redis.get).mockResolvedValueOnce(null);

    await setEmailProviderRateLimitState({
      emailAccountId: "account-1",
      provider: "google",
      retryAt,
      source: "test",
    });

    expect(redis.set).toHaveBeenCalledWith(
      "email-provider-rate-limit:account-1",
      expect.any(String),
      expect.objectContaining({
        ex: expect.any(Number),
      }),
    );

    vi.mocked(redis.get).mockResolvedValueOnce(
      JSON.stringify({
        provider: "google",
        retryAt: retryAt.toISOString(),
        source: "test",
        detectedAt: new Date().toISOString(),
      }),
    );

    const state = await getEmailProviderRateLimitState({
      emailAccountId: "account-1",
    });

    expect(state?.retryAt.toISOString()).toBe(retryAt.toISOString());
    expect(state?.source).toBe("test");
  });

  it("clears stale rate-limit entries", async () => {
    vi.mocked(redis.get).mockResolvedValueOnce(
      JSON.stringify({
        provider: "google",
        retryAt: new Date(Date.now() - 5000).toISOString(),
        detectedAt: new Date().toISOString(),
      }),
    );

    const state = await getEmailProviderRateLimitState({
      emailAccountId: "account-1",
    });

    expect(state).toBeNull();
    expect(redis.del).toHaveBeenCalledWith(
      "email-provider-rate-limit:account-1",
    );
  });

  it("throws a typed error when account is currently rate-limited", async () => {
    vi.mocked(redis.get).mockResolvedValueOnce(
      JSON.stringify({
        provider: "google",
        retryAt: new Date(Date.now() + 60_000).toISOString(),
        source: "test",
        detectedAt: new Date().toISOString(),
      }),
    );

    await expect(
      assertProviderNotRateLimited({
        emailAccountId: "account-1",
        provider: "google",
      }),
    ).rejects.toBeInstanceOf(ProviderRateLimitModeError);
  });

  it("records rate-limit mode from gmail retry errors", async () => {
    const retryAt = new Date(Date.now() + 120_000).toISOString();
    vi.mocked(redis.get).mockResolvedValueOnce(null);

    const state = await recordProviderRateLimitFromError({
      emailAccountId: "account-1",
      provider: "google",
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
      "email-provider-rate-limit:account-1",
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
          provider: "google",
          source: "test-wrapper",
        },
        async () => {
          throw rateLimitError;
        },
      ),
    ).rejects.toBe(rateLimitError);

    expect(redis.set).toHaveBeenCalledWith(
      "email-provider-rate-limit:account-1",
      expect.any(String),
      expect.objectContaining({
        ex: expect.any(Number),
      }),
    );
  });

  it("rethrows original error when recording state fails", async () => {
    const rateLimitError = {
      cause: {
        status: 429,
        message: "Rate limit exceeded",
      },
    };
    vi.mocked(redis.get).mockResolvedValueOnce(null);
    vi.mocked(redis.set).mockRejectedValueOnce(new Error("redis unavailable"));

    await expect(
      withRateLimitRecording(
        {
          emailAccountId: "account-1",
          provider: "google",
          source: "test-wrapper",
        },
        async () => {
          throw rateLimitError;
        },
      ),
    ).rejects.toBe(rateLimitError);
  });

  it("keeps existing longer retry window even when source differs", async () => {
    const existingRetryAt = new Date(Date.now() + 120_000);
    vi.mocked(redis.get).mockResolvedValueOnce(
      JSON.stringify({
        provider: "google",
        retryAt: existingRetryAt.toISOString(),
        source: "long-window",
        detectedAt: new Date().toISOString(),
      }),
    );

    const state = await setEmailProviderRateLimitState({
      emailAccountId: "account-1",
      provider: "google",
      retryAt: new Date(Date.now() + 30_000),
      source: "short-window",
    });

    expect(state.retryAt.toISOString()).toBe(existingRetryAt.toISOString());
    expect(state.source).toBe("long-window");
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("records rate-limit mode for microsoft provider errors", async () => {
    vi.mocked(redis.get).mockResolvedValueOnce(null);

    const state = await recordProviderRateLimitFromError({
      emailAccountId: "account-1",
      provider: "microsoft",
      error: {
        statusCode: 429,
        code: "TooManyRequests",
        response: {
          headers: {
            "retry-after": "45",
          },
        },
      },
      source: "test-outlook",
    });

    expect(state).not.toBeNull();
    expect(state?.provider).toBe("microsoft");
    expect(redis.set).toHaveBeenCalledWith(
      "email-provider-rate-limit:account-1",
      expect.any(String),
      expect.objectContaining({
        ex: expect.any(Number),
      }),
    );
  });

  it("records rate-limit state from mapped API error type", async () => {
    vi.mocked(redis.get).mockResolvedValueOnce(null);

    const provider = await recordRateLimitFromApiError({
      apiErrorType: "Outlook Rate Limit",
      emailAccountId: "account-1",
      error: {
        statusCode: 429,
        code: "TooManyRequests",
      },
      source: "test-outlook-api-error",
    });

    expect(provider).toBe("microsoft");
    expect(redis.set).toHaveBeenCalledWith(
      "email-provider-rate-limit:account-1",
      expect.any(String),
      expect.objectContaining({
        ex: expect.any(Number),
      }),
    );
  });

  it("does not throw when API-error rate-limit recording fails", async () => {
    vi.mocked(redis.get).mockResolvedValueOnce(null);
    vi.mocked(redis.set).mockRejectedValueOnce(new Error("redis unavailable"));

    await expect(
      recordRateLimitFromApiError({
        apiErrorType: "Gmail Rate Limit Exceeded",
        emailAccountId: "account-1",
        error: {
          cause: {
            status: 429,
            message: "Rate limit exceeded",
          },
        },
        source: "test-gmail-api-error",
      }),
    ).resolves.toBe("google");
  });
});
