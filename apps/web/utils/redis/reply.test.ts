import { beforeEach, describe, expect, it, vi } from "vitest";
import { getReplyWithConfidence, saveReply } from "@/utils/redis/reply";
import { redis } from "@/utils/redis";
import { DraftReplyConfidence } from "@/generated/prisma/enums";

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

  it("stores enum confidence value", async () => {
    await saveReply({
      emailAccountId: "account-1",
      messageId: "message-1",
      reply: "Draft reply",
      confidence: DraftReplyConfidence.STANDARD,
    });

    expect(redis.set).toHaveBeenCalledWith(
      "reply:account-1:message-1",
      JSON.stringify({
        reply: "Draft reply",
        confidence: DraftReplyConfidence.STANDARD,
      }),
      { ex: 60 * 60 * 24 },
    );
  });

  it("returns null for cache entries with unsupported confidence values", async () => {
    vi.mocked(redis.get).mockResolvedValue(
      JSON.stringify({
        reply: "Draft reply",
        confidence: "INVALID",
      }),
    );

    const result = await getReplyWithConfidence({
      emailAccountId: "account-1",
      messageId: "message-1",
    });

    expect(result).toBeNull();
  });
});
