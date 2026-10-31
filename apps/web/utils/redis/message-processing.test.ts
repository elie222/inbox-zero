import { beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "@/utils/redis";
import {
  acquireOutboundMessageLock,
  clearOutboundMessageLock,
  withMessageProcessingLock,
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

  it("releases only its own lock on any failure and preserves the error if Redis fails", async () => {
    const error = new Error("processing failed");
    vi.mocked(redis.set).mockResolvedValue("OK");
    vi.mocked(redis.eval).mockRejectedValue(new Error("Redis unavailable"));
    await expect(
      withMessageProcessingLock(
        { userEmail: "user@example.com", messageId: "message-1" },
        async () => {
          throw error;
        },
      ),
    ).rejects.toBe(error);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("GET", KEYS[1]) ~= ARGV[1]'),
      ["processing-message:user@example.com:message-1"],
      ["lock-uuid"],
    );
  });

  it("does not clear a replacement owner's lock after its own lock expires", async () => {
    let currentToken = "lock-uuid";
    vi.mocked(redis.set).mockResolvedValue("OK");
    vi.mocked(redis.eval).mockImplementation(async (_script, _keys, args) => {
      if (currentToken !== args[0]) return 0;
      currentToken = "";
      return 1;
    });
    const error = new Error("processing failed after expiry");
    await expect(
      withMessageProcessingLock(
        { userEmail: "user@example.com", messageId: "message-1" },
        async () => {
          currentToken = "replacement-owner";
          throw error;
        },
      ),
    ).rejects.toBe(error);
    expect(currentToken).toBe("replacement-owner");
  });

  it("keeps successful messages deduped", async () => {
    vi.mocked(redis.set).mockResolvedValueOnce("OK").mockResolvedValue(null);
    const process = vi.fn().mockResolvedValue(undefined);
    const key = { userEmail: "user@example.com", messageId: "message-1" };
    expect(await withMessageProcessingLock(key, process)).toEqual({
      skipped: false,
    });
    expect(await withMessageProcessingLock(key, process)).toEqual({
      skipped: true,
    });
    expect(process).toHaveBeenCalledTimes(1);
    expect(redis.eval).not.toHaveBeenCalled();
  });

  it("skips a concurrent run while processing is still in progress", async () => {
    vi.mocked(redis.set).mockResolvedValueOnce("OK").mockResolvedValue(null);
    const key = { userEmail: "user@example.com", messageId: "message-1" };
    const { promise, resolve } = Promise.withResolvers<void>();
    const first = withMessageProcessingLock(key, () => promise);
    const concurrent = vi.fn();
    expect(await withMessageProcessingLock(key, concurrent)).toEqual({
      skipped: true,
    });
    expect(concurrent).not.toHaveBeenCalled();
    resolve();
    await first;
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
