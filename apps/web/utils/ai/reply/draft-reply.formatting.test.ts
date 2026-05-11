import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEmail, getEmailAccount } from "@/__tests__/helpers";
import {
  aiDraftReply,
  aiDraftReplyWithConfidence,
  normalizeDraftReplyFormatting,
} from "@/utils/ai/reply/draft-reply";
import { DRAFT_PIPELINE_VERSION } from "@/utils/ai/reply/draft-attribution";
import { DraftReplyConfidence } from "@/generated/prisma/enums";

const { mockCreateGenerateObject, mockGenerateObject } = vi.hoisted(() => {
  const mockGenerateObject = vi.fn();
  const mockCreateGenerateObject = vi.fn(() => mockGenerateObject);
  return { mockCreateGenerateObject, mockGenerateObject };
});

vi.mock("@/utils/llms/model", () => ({
  getModel: vi.fn(() => ({
    provider: "openai",
    modelName: "test-model",
    model: {},
    providerOptions: undefined,
    fallbackModels: [],
  })),
}));

vi.mock("@/utils/llms/index", () => ({
  createGenerateObject: mockCreateGenerateObject,
}));

describe("aiDraftReply formatting", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("preserves existing blank-line paragraph spacing", async () => {
    const result = normalizeDraftReplyFormatting(
      "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.",
    );

    expect(result).toBe(
      "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.",
    );
  });

  it("converts single-line paragraph separators into blank-line separators", async () => {
    const result = normalizeDraftReplyFormatting(
      "First paragraph.\nSecond paragraph.\nThird paragraph.",
    );

    expect(result).toBe(
      "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.",
    );
  });

  it("converts two single-line paragraphs into blank-line paragraphs", async () => {
    const result = normalizeDraftReplyFormatting(
      "First paragraph.\nSecond paragraph.",
    );

    expect(result).toBe("First paragraph.\n\nSecond paragraph.");
  });

  it("normalizes carriage returns and unicode line separators", async () => {
    const result = normalizeDraftReplyFormatting(
      "First paragraph.\r\nSecond paragraph.\rThird paragraph.\u2028Fourth paragraph.\u2029Fifth paragraph.",
    );

    expect(result).toBe(
      "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n\nFourth paragraph.\n\nFifth paragraph.",
    );
  });

  it("decodes escaped newline sequences from model output", async () => {
    const result = normalizeDraftReplyFormatting(
      "First paragraph.\\nSecond paragraph.\\nThird paragraph.\\r\\nFourth paragraph.",
    );

    expect(result).toBe(
      "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n\nFourth paragraph.",
    );
  });

  it("decodes escaped newline sequences in mixed newline output", async () => {
    const result = normalizeDraftReplyFormatting(
      "First paragraph.\nSecond paragraph.\\nThird paragraph.",
    );

    expect(result).toBe(
      "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.",
    );
  });

  it("decodes escaped carriage return sequences", async () => {
    const result = normalizeDraftReplyFormatting(
      "First paragraph.\\rSecond paragraph.",
    );

    expect(result).toBe("First paragraph.\n\nSecond paragraph.");
  });

  it("trims trailing whitespace and collapses excessive blank lines", async () => {
    const result = normalizeDraftReplyFormatting(
      "  First paragraph.   \n\n\n\nSecond paragraph. \t ",
    );

    expect(result).toBe("First paragraph.\n\nSecond paragraph.");
  });

  it("repairs paragraph breaks collapsed without spaces", async () => {
    const result = normalizeDraftReplyFormatting(
      "First sentence in the opening paragraph.Second sentence starts the next paragraph.Third sentence starts another paragraph.",
    );

    expect(result).toBe(
      "First sentence in the opening paragraph.\n\nSecond sentence starts the next paragraph.\n\nThird sentence starts another paragraph.",
    );
  });

  it("does not split a single ordinary glued abbreviation-like boundary", async () => {
    const result = normalizeDraftReplyFormatting(
      "The draft uses v1.Release wording for the note.",
    );

    expect(result).toBe("The draft uses v1.Release wording for the note.");
  });

  it("leaves ordinary single-line text unchanged", async () => {
    const result = normalizeDraftReplyFormatting(
      "One short sentence with no paragraph breaks.",
    );

    expect(result).toBe("One short sentence with no paragraph breaks.");
  });

  it("normalizes mixed single and double newline paragraph separators", async () => {
    const result = normalizeDraftReplyFormatting(
      "First paragraph.\nSecond paragraph.\n\nThird paragraph.\nFourth paragraph.",
    );

    expect(result).toBe(
      "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n\nFourth paragraph.",
    );
  });

  it("normalizes long replies with more than 8 single-line paragraphs", async () => {
    const result = normalizeDraftReplyFormatting(
      Array.from({ length: 9 }, (_, i) => `Paragraph ${i + 1}.`).join("\n"),
    );

    expect(result).toBe(
      Array.from({ length: 9 }, (_, i) => `Paragraph ${i + 1}.`).join("\n\n"),
    );
  });

  it("does not convert list output into double-spaced paragraphs", async () => {
    const result = normalizeDraftReplyFormatting(
      "- First item\n- Second item\n- Third item",
    );

    expect(result).toBe("- First item\n- Second item\n- Third item");
  });

  it("does not convert low-punctuation line breaks into paragraphs", async () => {
    const result = normalizeDraftReplyFormatting(
      "Heading\nShort detail\nAnother detail.",
    );

    expect(result).toBe("Heading\nShort detail\nAnother detail.");
  });

  it("retries once then rejects persistent repetitive output", async () => {
    const repetitiveReply = `Good afternoon, ${"0".repeat(500)}`;
    mockGenerateObject
      .mockResolvedValueOnce({ object: { reply: repetitiveReply } })
      .mockResolvedValueOnce({ object: { reply: repetitiveReply } });

    await expect(aiDraftReply(getDraftParams())).rejects.toThrow(
      "Draft reply generation produced invalid output",
    );
    expect(mockGenerateObject).toHaveBeenCalledTimes(2);
  });

  it("accepts retry result when second attempt succeeds", async () => {
    const repetitiveReply = `Good afternoon, ${"0".repeat(500)}`;
    mockGenerateObject
      .mockResolvedValueOnce({ object: { reply: repetitiveReply } })
      .mockResolvedValueOnce({
        object: { reply: "Thank you for your email." },
      });

    const result = await aiDraftReply(getDraftParams());

    expect(result).toBe("Thank you for your email.");
    expect(mockGenerateObject).toHaveBeenCalledTimes(2);
  });

  it("accepts text with separator lines like dashes or equals", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        reply: `Please see below.\n${"=".repeat(40)}\nImportant section.`,
      },
    });

    const result = await aiDraftReply(getDraftParams());

    expect(result).toContain("Please see below.");
    expect(result).toContain("Important section.");
  });

  it("accepts normal text that happens to have short repeated characters", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        reply: "Hmmm, let me think about that. Sounds good!!!",
      },
    });

    const result = await aiDraftReply(getDraftParams());

    expect(result).toBe("Hmmm, let me think about that. Sounds good!!!");
  });

  it("includes learned reply memories when provided", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        reply: "Thanks for your message.",
        confidence: DraftReplyConfidence.STANDARD,
      },
    });

    await aiDraftReplyWithConfidence({
      ...getDraftParams(),
      replyMemoryContent:
        "1. [FACT | TOPIC:pricing] Mention that pricing depends on seat count.",
    });

    const [callArgs] = mockGenerateObject.mock.calls.at(-1)!;

    expect(callArgs.prompt).toContain("<reply_memories>");
    expect(callArgs.prompt).toContain(
      "Mention that pricing depends on seat count.",
    );
  });

  it("omits the learned reply memories block when no memories are provided", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        reply: "Thanks for your message.",
        confidence: DraftReplyConfidence.STANDARD,
      },
    });

    await aiDraftReplyWithConfidence(getDraftParams());

    const [callArgs] = mockGenerateObject.mock.calls.at(-1)!;

    expect(callArgs.prompt).not.toContain("<reply_memories>");
  });

  it("uses learned writing style as the primary style block when explicit style is absent", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        reply: "Thanks for your message.",
        confidence: DraftReplyConfidence.STANDARD,
      },
    });

    await aiDraftReplyWithConfidence({
      ...getDraftParams(),
      learnedWritingStyle: `Observed patterns:
- Keep replies terse and low ceremony.
Representative edits:
- Remove filler and greetings.`,
    });

    const [callArgs] = mockGenerateObject.mock.calls.at(-1)!;

    expect(callArgs.prompt).toContain("<writing_style>");
    expect(callArgs.prompt).toContain("Keep replies terse and low ceremony.");
    expect(callArgs.prompt).not.toContain("<learned_writing_style>");
  });

  it("treats whitespace-only explicit writing style as absent", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        reply: "Thanks for your message.",
        confidence: DraftReplyConfidence.STANDARD,
      },
    });

    await aiDraftReplyWithConfidence({
      ...getDraftParams(),
      writingStyle: "  \n  ",
      learnedWritingStyle: `Observed patterns:
- Keep replies terse and low ceremony.
Representative edits:
- Remove filler and greetings.`,
    });

    const [callArgs] = mockGenerateObject.mock.calls.at(-1)!;

    expect(callArgs.prompt).toContain("<writing_style>");
    expect(callArgs.prompt).toContain("Keep replies terse and low ceremony.");
    expect(callArgs.prompt).not.toContain("<learned_writing_style>");
  });

  it("keeps learned writing style advisory when explicit style is present", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        reply: "Thanks for your message.",
        confidence: DraftReplyConfidence.STANDARD,
      },
    });

    await aiDraftReplyWithConfidence({
      ...getDraftParams(),
      writingStyle: "Be warm, concise, and confident.",
      learnedWritingStyle: `Observed patterns:
- Keep replies terse and low ceremony.
Representative edits:
- Remove filler and greetings.`,
    });

    const [callArgs] = mockGenerateObject.mock.calls.at(-1)!;

    expect(callArgs.prompt).toContain("<writing_style>");
    expect(callArgs.prompt).toContain("Be warm, concise, and confident.");
    expect(callArgs.prompt).toContain("<learned_writing_style>");
    expect(callArgs.prompt).toContain("Keep replies terse and low ceremony.");
  });

  it("omits learned writing style when it trims to empty", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        reply: "Thanks for your message.",
        confidence: DraftReplyConfidence.STANDARD,
      },
    });

    await aiDraftReplyWithConfidence({
      ...getDraftParams(),
      writingStyle: "Be warm, concise, and confident.",
      learnedWritingStyle: "   \n   ",
    });

    const [callArgs] = mockGenerateObject.mock.calls.at(-1)!;

    expect(callArgs.prompt).toContain("<writing_style>");
    expect(callArgs.prompt).toContain("Be warm, concise, and confident.");
    expect(callArgs.prompt).not.toContain("<learned_writing_style>");
  });

  it("defaults invalid confidence values to ALL_EMAILS", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        reply: "Thanks for your message.",
        confidence: Number.NaN,
      },
    });

    const result = await aiDraftReplyWithConfidence(getDraftParams());

    expect(result.confidence).toBe(DraftReplyConfidence.ALL_EMAILS);
  });

  it("maps model-facing confidence levels to product settings", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        reply: "Thanks for your message.",
        confidence: "MEDIUM",
      },
    });

    const result = await aiDraftReplyWithConfidence(getDraftParams());

    expect(result.confidence).toBe(DraftReplyConfidence.STANDARD);
  });

  it("returns the actual provider and model used for the successful draft generation", async () => {
    mockCreateGenerateObject.mockImplementationOnce(({ onModelUsed }) =>
      vi.fn().mockImplementationOnce(async () => {
        await onModelUsed?.({
          provider: "openai",
          modelName: "gpt-5-mini",
        });

        return {
          object: {
            reply: "Thanks for your message.",
            confidence: DraftReplyConfidence.STANDARD,
          },
        };
      }),
    );

    const result = await aiDraftReplyWithConfidence(getDraftParams());

    expect(result.attribution).toEqual({
      provider: "openai",
      modelName: "gpt-5-mini",
      pipelineVersion: DRAFT_PIPELINE_VERSION,
    });
  });
});

function getDraftParams() {
  const message = getEmail({
    from: "sender@example.com",
    subject: "Question",
    to: "user@example.com",
    date: new Date("2026-02-06T12:00:00.000Z"),
    content: "Can you help with this?",
  });

  const baseEmailAccount = getEmailAccount({
    email: "user@example.com",
  });
  const emailAccount = {
    ...baseEmailAccount,
    id: "account-1",
    user: {
      ...baseEmailAccount.user,
      aiProvider: "openai",
      aiModel: "gpt-5.1",
      aiApiKey: null,
    },
  };

  return {
    messages: [{ ...message, id: "msg-1" }],
    emailAccount,
    knowledgeBaseContent: null,
    emailHistorySummary: null,
    emailHistoryContext: null,
    calendarAvailability: null,
    writingStyle: null,
    mcpContext: null,
    meetingContext: null,
  } as Parameters<typeof aiDraftReply>[0];
}
