import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEmail, getEmailAccount } from "@/__tests__/helpers";
import { aiDraftReply } from "@/utils/ai/reply/draft-reply";

const { mockCreateGenerateObject, mockGenerateObject } = vi.hoisted(() => {
  const mockGenerateObject = vi.fn();
  const mockCreateGenerateObject = vi.fn(() => mockGenerateObject);
  return { mockCreateGenerateObject, mockGenerateObject };
});

vi.mock("server-only", () => ({}));

vi.mock("@/utils/llms/model", () => ({
  getModel: vi.fn(() => ({
    provider: "openai",
    modelName: "test-model",
    model: {},
    providerOptions: undefined,
    backupModel: null,
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
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        reply: "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.",
      },
    });

    const result = await aiDraftReply(getDraftParams());

    expect(result).toBe(
      "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.",
    );
  });

  it("converts single-line paragraph separators into blank-line separators", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        reply: "First paragraph.\nSecond paragraph.\nThird paragraph.",
      },
    });

    const result = await aiDraftReply(getDraftParams());

    expect(result).toBe(
      "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.",
    );
  });

  it("converts two single-line paragraphs into blank-line paragraphs", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        reply: "First paragraph.\nSecond paragraph.",
      },
    });

    const result = await aiDraftReply(getDraftParams());

    expect(result).toBe("First paragraph.\n\nSecond paragraph.");
  });

  it("decodes escaped newline sequences from model output", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        reply:
          "First paragraph.\\nSecond paragraph.\\nThird paragraph.\\r\\nFourth paragraph.",
      },
    });

    const result = await aiDraftReply(getDraftParams());

    expect(result).toBe(
      "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n\nFourth paragraph.",
    );
  });

  it("decodes escaped newline sequences in mixed newline output", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        reply: "First paragraph.\nSecond paragraph.\\nThird paragraph.",
      },
    });

    const result = await aiDraftReply(getDraftParams());

    expect(result).toBe(
      "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.",
    );
  });

  it("normalizes mixed single and double newline paragraph separators", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        reply:
          "First paragraph.\nSecond paragraph.\n\nThird paragraph.\nFourth paragraph.",
      },
    });

    const result = await aiDraftReply(getDraftParams());

    expect(result).toBe(
      "First paragraph.\n\nSecond paragraph.\n\nThird paragraph.\n\nFourth paragraph.",
    );
  });

  it("normalizes long replies with more than 8 single-line paragraphs", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        reply: Array.from({ length: 9 }, (_, i) => `Paragraph ${i + 1}.`).join(
          "\n",
        ),
      },
    });

    const result = await aiDraftReply(getDraftParams());

    expect(result).toBe(
      Array.from({ length: 9 }, (_, i) => `Paragraph ${i + 1}.`).join("\n\n"),
    );
  });

  it("does not convert list output into double-spaced paragraphs", async () => {
    mockGenerateObject.mockResolvedValueOnce({
      object: {
        reply: "- First item\n- Second item\n- Third item",
      },
    });

    const result = await aiDraftReply(getDraftParams());

    expect(result).toBe("- First item\n- Second item\n- Third item");
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
