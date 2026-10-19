import { beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "@/utils/redis";
import {
  acquireOutboundMessageLock,
  clearOutboundMessageLock,
  markMessageAsProcessing,
  markOutboundMessageProcessed,
  releaseMessageProcessingLock,
  releaseMessageProcessingLockOnRateLimit,
} from "@/utils/redis/message-processing";
import { ProviderRateLimitModeError } from "@/utils/email/rate-limit-mode-error";
import { createTestLogger } from "@/__tests__/helpers";

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => "lock-uuid"),
}));

vi.mock("@/utils/redis", () => ({
  redis: {
    set: vi.fn(),
    eval: vi.fn(),
  },
}));

describe("message-processing redis locks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("acquires the short-lived webhook processing lock", async () => {
    vi.mocked(redis.set).mockResolvedValue("OK");

    const acquired = await markMessageAsProcessing({
      userEmail: "user@example.com",
      messageId: "message-1",
    });

    expect(acquired).toBe("lock-uuid");
    expect(redis.set).toHaveBeenCalledWith(
      "processing-message:user@example.com:message-1",
      "lock-uuid",
      { ex: 300, nx: true },
    );
  });

  it("returns null when the message is already being processed", async () => {
    vi.mocked(redis.set).mockResolvedValue(null);

    const acquired = await markMessageAsProcessing({
      userEmail: "user@example.com",
      messageId: "message-1",
    });

    expect(acquired).toBeNull();
  });

  it("releases the processing lock after a provider rate limit so the catch-up can retry", async () => {
    vi.mocked(redis.eval).mockResolvedValue(1);

    await releaseMessageProcessingLockOnRateLimit({
      error: new ProviderRateLimitModeError({ provider: "google" }),
      provider: "google",
      userEmail: "user@example.com",
      messageId: "message-1",
      lockToken: "lock-uuid",
      logger: createTestLogger(),
    });

    expect(redis.eval).toHaveBeenCalledWith(
      expect.any(String),
      ["processing-message:user@example.com:message-1"],
      ["lock-uuid"],
    );
  });

  it("keeps the processing lock after a failure that is not a rate limit", async () => {
    await releaseMessageProcessingLockOnRateLimit({
      error: new Error("boom"),
      provider: "google",
      userEmail: "user@example.com",
      messageId: "message-1",
      lockToken: "lock-uuid",
      logger: createTestLogger(),
    });

    expect(redis.eval).not.toHaveBeenCalled();
  });

  it("does not throw when releasing the lock fails, so the rate-limit error is kept", async () => {
    vi.mocked(redis.eval).mockRejectedValue(new Error("redis down"));

    await expect(
      releaseMessageProcessingLockOnRateLimit({
        error: new ProviderRateLimitModeError({ provider: "microsoft" }),
        provider: "microsoft",
        userEmail: "user@example.com",
        messageId: "message-1",
        lockToken: "lock-uuid",
        logger: createTestLogger(),
      }),
    ).resolves.toBeUndefined();
  });

  it("releases the webhook processing lock only for its owner", async () => {
    vi.mocked(redis.eval).mockResolvedValue(1);

    const released = await releaseMessageProcessingLock({
      userEmail: "user@example.com",
      messageId: "message-1",
      lockToken: "lock-uuid",
    });

    expect(released).toBe(true);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("DEL", KEYS[1])'),
      ["processing-message:user@example.com:message-1"],
      ["lock-uuid"],
    );
  });

  it("acquires an outbound message lock and returns its token", async () => {
    vi.mocked(redis.set).mockResolvedValue("OK");

    const lockToken = await acquireOutboundMessageLock({
      emailAccountId: "account-1",
      messageId: "message-1",
    });

    expect(lockToken).toBe("lock-uuid");
    expect(redis.set).toHaveBeenCalledWith(
      "reply-tracker:outbound-message:account-1:message-1",
      "lock-uuid",
      { ex: 1800, nx: true },
    );
  });

  it("marks an outbound message as processed only when the lock is owned", async () => {
    vi.mocked(redis.eval).mockResolvedValue(1);

    const marked = await markOutboundMessageProcessed({
      emailAccountId: "account-1",
      messageId: "message-1",
      lockToken: "lock-token-1",
    });

    expect(marked).toBe(true);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("SET"'),
      ["reply-tracker:outbound-message:account-1:message-1"],
      ["lock-token-1", "processed", "2592000"],
    );
  });

  it("clears an outbound message lock only when the lock is owned", async () => {
    vi.mocked(redis.eval).mockResolvedValue(1);

    const cleared = await clearOutboundMessageLock({
      emailAccountId: "account-1",
      messageId: "message-1",
      lockToken: "lock-token-1",
    });

    expect(cleared).toBe(true);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("DEL"'),
      ["reply-tracker:outbound-message:account-1:message-1"],
      ["lock-token-1"],
    );
  });
});
