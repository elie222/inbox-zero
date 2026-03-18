import { beforeEach, describe, expect, it, vi } from "vitest";
import { getReplyWithConfidence, saveReply } from "@/utils/redis/reply";
import { DRAFT_PIPELINE_VERSION } from "@/utils/ai/reply/draft-attribution";
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
      attribution: {
        provider: "openai",
        modelName: "gpt-5.1",
        pipelineVersion: DRAFT_PIPELINE_VERSION,
      },
    });

    expect(redis.set).toHaveBeenCalledWith(
      "reply:account-1:message-1",
      JSON.stringify({
        reply: "Draft reply",
        confidence: DraftReplyConfidence.STANDARD,
        attribution: {
          provider: "openai",
          modelName: "gpt-5.1",
          pipelineVersion: DRAFT_PIPELINE_VERSION,
        },
      }),
      { ex: 60 * 60 * 24 },
    );
  });

  it("returns cached attribution metadata when present", async () => {
    vi.mocked(redis.get).mockResolvedValue(
      JSON.stringify({
        reply: "Draft reply",
        confidence: DraftReplyConfidence.HIGH_CONFIDENCE,
        attribution: {
          provider: "openai",
          modelName: "gpt-5.1",
          pipelineVersion: DRAFT_PIPELINE_VERSION,
        },
      }),
    );

    const result = await getReplyWithConfidence({
      emailAccountId: "account-1",
      messageId: "message-1",
    });

    expect(result).toEqual({
      attachments: undefined,
      reply: "Draft reply",
      confidence: DraftReplyConfidence.HIGH_CONFIDENCE,
      attribution: {
        provider: "openai",
        modelName: "gpt-5.1",
        pipelineVersion: DRAFT_PIPELINE_VERSION,
      },
      draftContextMetadata: null,
    });
  });

  it("returns null for unsupported confidence values", async () => {
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

  it("returns null for plain-string cache entries", async () => {
    vi.mocked(redis.get).mockResolvedValue("Legacy draft reply");

    const result = await getReplyWithConfidence({
      emailAccountId: "account-1",
      messageId: "message-1",
    });

    expect(result).toBeNull();
  });

  it("stores rule-scoped attachment selections for delayed draft execution", async () => {
    await saveReply({
      emailAccountId: "account-1",
      messageId: "message-1",
      ruleId: "rule-1",
      reply: "Draft reply",
      confidence: DraftReplyConfidence.HIGH_CONFIDENCE,
      attachments: [
        {
          driveConnectionId: "drive-1",
          fileId: "file-1",
          filename: "lease.pdf",
          mimeType: "application/pdf",
          reason: "Matched the property request",
        },
      ],
    });

    expect(redis.set).toHaveBeenCalledWith(
      "reply:account-1:message-1:rule-1",
      JSON.stringify({
        reply: "Draft reply",
        confidence: DraftReplyConfidence.HIGH_CONFIDENCE,
        attachments: [
          {
            driveConnectionId: "drive-1",
            fileId: "file-1",
            filename: "lease.pdf",
            mimeType: "application/pdf",
            reason: "Matched the property request",
          },
        ],
      }),
      { ex: 60 * 60 * 24 * 90 },
    );
  });
});
