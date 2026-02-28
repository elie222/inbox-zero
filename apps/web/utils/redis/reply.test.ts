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

  it("stores missing confidence as ALL_EMAILS", async () => {
    await saveReply({
      emailAccountId: "account-1",
      messageId: "message-1",
      reply: "Draft reply",
    });

    expect(redis.set).toHaveBeenCalledWith(
      "reply:account-1:message-1",
      JSON.stringify({
        reply: "Draft reply",
        confidence: DraftReplyConfidence.ALL_EMAILS,
      }),
      { ex: 60 * 60 * 24 },
    );
  });

  it("maps legacy numeric confidence values to enum when reading cache", async () => {
    vi.mocked(redis.get).mockResolvedValue(
      JSON.stringify({
        reply: "Legacy draft reply",
        confidence: 85,
      }),
    );

    const result = await getReplyWithConfidence({
      emailAccountId: "account-1",
      messageId: "message-1",
    });

    expect(result).toEqual({
      reply: "Legacy draft reply",
      confidence: DraftReplyConfidence.STANDARD,
    });
  });
});
