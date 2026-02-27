import { beforeEach, describe, expect, it, vi } from "vitest";
import { saveReply } from "@/utils/redis/reply";
import { redis } from "@/utils/redis";

vi.mock("@/utils/redis", () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

describe("saveReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("stores non-finite confidence values as 0", async () => {
    await saveReply({
      emailAccountId: "account-1",
      messageId: "message-1",
      reply: "Draft reply",
      confidence: Number.NaN,
    });

    expect(redis.set).toHaveBeenCalledWith(
      "reply:account-1:message-1",
      JSON.stringify({
        reply: "Draft reply",
        confidence: 0,
      }),
      { ex: 60 * 60 * 24 },
    );
  });
});
