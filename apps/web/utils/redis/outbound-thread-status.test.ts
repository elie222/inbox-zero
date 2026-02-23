import { beforeEach, describe, expect, it, vi } from "vitest";
import { redis } from "@/utils/redis";
import {
  acquireOutboundThreadStatusLock,
  clearOutboundThreadStatusLock,
  markOutboundThreadStatusProcessed,
} from "@/utils/redis/outbound-thread-status";

vi.mock("node:crypto", () => ({
  randomUUID: vi.fn(() => "lock-uuid"),
}));

vi.mock("@/utils/redis", () => ({
  redis: {
    set: vi.fn(),
    eval: vi.fn(),
  },
}));

describe("outbound-thread-status redis locks", () => {
  const key = {
    emailAccountId: "account-1",
    threadId: "thread-1",
    messageId: "message-1",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("acquires lock and returns token when key is set", async () => {
    vi.mocked(redis.set).mockResolvedValue("OK");

    const lockToken = await acquireOutboundThreadStatusLock(key);

    expect(lockToken).toBe("lock-uuid");
    expect(redis.set).toHaveBeenCalledWith(
      "reply-tracker:outbound-thread-status:account-1:thread-1:message-1",
      "lock-uuid",
      { ex: 300, nx: true },
    );
  });

  it("returns null when lock already exists", async () => {
    vi.mocked(redis.set).mockResolvedValue(null);

    const lockToken = await acquireOutboundThreadStatusLock(key);

    expect(lockToken).toBeNull();
  });

  it("marks lock as processed only when token is owned", async () => {
    vi.mocked(redis.eval).mockResolvedValue(1);

    const marked = await markOutboundThreadStatusProcessed({
      ...key,
      lockToken: "lock-token-1",
    });

    expect(marked).toBe(true);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("SET"'),
      ["reply-tracker:outbound-thread-status:account-1:thread-1:message-1"],
      ["lock-token-1", "2592000"],
    );
  });

  it("clears lock only when token is owned", async () => {
    vi.mocked(redis.eval).mockResolvedValue(1);

    const cleared = await clearOutboundThreadStatusLock({
      ...key,
      lockToken: "lock-token-1",
    });

    expect(cleared).toBe(true);
    expect(redis.eval).toHaveBeenCalledWith(
      expect.stringContaining('redis.call("DEL"'),
      ["reply-tracker:outbound-thread-status:account-1:thread-1:message-1"],
      ["lock-token-1"],
    );
  });

  it("does not attempt redis eval when lock token is missing", async () => {
    const marked = await markOutboundThreadStatusProcessed(key);
    const cleared = await clearOutboundThreadStatusLock(key);

    expect(marked).toBe(false);
    expect(cleared).toBe(false);
    expect(redis.eval).not.toHaveBeenCalled();
  });
});
