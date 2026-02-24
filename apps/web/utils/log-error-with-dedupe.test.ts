import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockedEnv } = vi.hoisted(() => ({
  mockedEnv: {
    NODE_ENV: "production",
    UPSTASH_REDIS_URL: "https://redis.example.com",
    UPSTASH_REDIS_TOKEN: "token",
    NEXT_PUBLIC_AXIOM_TOKEN: undefined,
    NEXT_PUBLIC_LOG_SCOPES: undefined,
    ENABLE_DEBUG_LOGS: false,
  },
}));

vi.mock("@/env", () => ({
  env: mockedEnv,
}));

vi.mock("@/utils/redis", () => ({
  redis: {
    set: vi.fn(),
    incr: vi.fn(),
    expire: vi.fn(),
  },
}));

import { redis } from "@/utils/redis";
import { createScopedLogger } from "@/utils/logger";
import { logErrorWithDedupe } from "@/utils/log-error-with-dedupe";

describe("logErrorWithDedupe", () => {
  beforeEach(() => {
    mockedEnv.NODE_ENV = "production";
    mockedEnv.UPSTASH_REDIS_URL = "https://redis.example.com";
    mockedEnv.UPSTASH_REDIS_TOKEN = "token";
    vi.clearAllMocks();
  });

  it("logs immediately when dedupe is disabled", async () => {
    mockedEnv.NODE_ENV = "test";
    const logger = createScopedLogger("test");
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    await logErrorWithDedupe({
      logger,
      message: "Error processing webhook",
      error: new Error("something failed"),
      dedupeKeyParts: {
        scope: "test",
      },
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("logs first occurrence and primes counter", async () => {
    vi.mocked(redis.set)
      .mockResolvedValueOnce("OK")
      .mockResolvedValueOnce("OK");
    const logger = createScopedLogger("test");
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    await logErrorWithDedupe({
      logger,
      message: "Error handling outbound reply",
      error: new Error("ApplicationThrottled"),
      dedupeKeyParts: {
        scope: "outlook/webhook",
        emailAccountId: "account-1",
      },
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(redis.set).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining("log-dedupe:v1:seen:"),
      "1",
      { ex: 300, nx: true },
    );
    expect(redis.set).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("log-dedupe:v1:count:"),
      "0",
      { ex: 360 },
    );
    expect(redis.incr).not.toHaveBeenCalled();
  });

  it("suppresses duplicate when summary lock is not available", async () => {
    vi.mocked(redis.set)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    vi.mocked(redis.incr).mockResolvedValue(2);
    vi.mocked(redis.expire).mockResolvedValue(1);
    const logger = createScopedLogger("test");
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    await logErrorWithDedupe({
      logger,
      message: "Error processing message",
      error: new Error("ApplicationThrottled"),
      dedupeKeyParts: {
        scope: "webhook/process-history-item",
        emailAccountId: "account-1",
      },
    });

    expect(errorSpy).not.toHaveBeenCalled();
    expect(redis.incr).toHaveBeenCalledTimes(1);
  });

  it("logs summary after duplicate when summary lock is acquired", async () => {
    vi.mocked(redis.set)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce("OK");
    vi.mocked(redis.incr).mockResolvedValue(7);
    vi.mocked(redis.expire).mockResolvedValue(1);
    const logger = createScopedLogger("test");
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    await logErrorWithDedupe({
      logger,
      message: "Failed to watch emails for account",
      error: new Error("invalid_grant"),
      dedupeKeyParts: {
        scope: "watch/all",
        emailAccountId: "account-1",
      },
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      "Failed to watch emails for account",
      expect.objectContaining({
        deduped: true,
        suppressedCount: 7,
      }),
    );
  });

  it("falls back to normal logging when redis access fails", async () => {
    vi.mocked(redis.set).mockRejectedValue(new Error("redis down"));
    const logger = createScopedLogger("test");
    const errorSpy = vi.spyOn(logger, "error").mockImplementation(() => {});

    await logErrorWithDedupe({
      logger,
      message: "Error executing action",
      error: new Error("boom"),
      dedupeKeyParts: {
        scope: "ai/choose-rule/execute",
        emailAccountId: "account-1",
      },
    });

    expect(errorSpy).toHaveBeenCalledTimes(1);
  });
});
