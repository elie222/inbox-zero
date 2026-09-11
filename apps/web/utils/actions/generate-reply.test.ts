import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { DraftReplyConfidence } from "@/generated/prisma/enums";
import { generateNudgeReplyAction } from "@/utils/actions/generate-reply";
import { DRAFT_PIPELINE_VERSION } from "@/utils/ai/reply/draft-attribution";
import { aiGenerateNudge } from "@/utils/ai/reply/generate-nudge";
import { getReply, saveReply } from "@/utils/redis/reply";
import { getEmailAccountWithAi } from "@/utils/user/get";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));
vi.mock("@/utils/ai/reply/generate-nudge");
vi.mock("@/utils/redis/reply");
vi.mock("@/utils/user/get");

describe("generateNudgeReplyAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    prisma.emailAccount.findUnique.mockResolvedValue({
      email: "user@example.com",
      account: {
        userId: "user-1",
        provider: "google",
      },
    } as any);
  });

  it("stores generated nudges without draft attribution metadata", async () => {
    vi.mocked(getEmailAccountWithAi).mockResolvedValue({
      id: "account-1",
      email: "user@example.com",
    } as any);
    vi.mocked(getReply).mockResolvedValue(null);
    vi.mocked(aiGenerateNudge).mockResolvedValue({
      text: "Follow up message",
      attribution: {
        provider: "openai",
        modelName: "gpt-5-mini",
        pipelineVersion: DRAFT_PIPELINE_VERSION,
      },
    } as any);

    const result = await generateNudgeReplyAction("account-1", {
      messages: [
        {
          id: "message-1",
          from: "sender@example.com",
          to: "user@example.com",
          subject: "Question",
          textPlain: "Can you follow up?",
          date: "2026-03-16T10:00:00.000Z",
        },
      ],
    });

    expect(saveReply).toHaveBeenCalledWith({
      emailAccountId: "account-1",
      messageId: "message-1",
      reply: "Follow up message",
      confidence: DraftReplyConfidence.ALL_EMAILS,
      attribution: {
        provider: "openai",
        modelName: "gpt-5-mini",
        pipelineVersion: DRAFT_PIPELINE_VERSION,
      },
    });
    expect(result?.data).toEqual({ text: "Follow up message" });
  });
});
