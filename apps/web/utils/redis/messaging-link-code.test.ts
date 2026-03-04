import { beforeEach, describe, expect, it, vi } from "vitest";
import { consumeMessagingLinkNonce } from "@/utils/redis/messaging-link-code";

vi.mock("@/utils/redis", () => ({
  redis: {
    set: vi.fn(),
  },
}));

import { redis } from "@/utils/redis";

describe("consumeMessagingLinkNonce", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns true when redis set succeeds", async () => {
    vi.mocked(redis.set).mockResolvedValueOnce("OK");

    const result = await consumeMessagingLinkNonce("nonce-123");

    expect(result).toBe(true);
  });

  it("returns false when redis set throws", async () => {
    vi.mocked(redis.set).mockRejectedValueOnce(new Error("redis unavailable"));

    const result = await consumeMessagingLinkNonce("nonce-123");

    expect(result).toBe(false);
  });
});
