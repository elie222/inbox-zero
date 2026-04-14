import { beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "@/utils/redis";
import {
  acquireOutboundMessageLock,
  clearOutboundMessageLock,
  markMessageAsProcessing,
  markOutboundMessageProcessed,
} from "@/utils/redis/message-processing";

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

    expect(acquired).toBe(true);
    expect(redis.set).toHaveBeenCalledWith(
      "processing-message:user@example.com:message-1",
      "true",
      { ex: 300, nx: true },
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
