import { beforeEach, describe, expect, it, vi } from "vitest";
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
  return {
    messages: [
      {
        id: "msg-1",
        from: "sender@example.com",
        to: "user@example.com",
        subject: "Question",
        date: new Date("2026-02-06T12:00:00.000Z"),
        content: "Can you help with this?",
      },
    ],
    emailAccount: {
      id: "account-1",
      email: "user@example.com",
      about: null,
      calendarBookingLink: null,
      user: {
        aiProvider: "openai",
        aiModel: "gpt-5.1",
        aiApiKey: null,
      },
    },
    knowledgeBaseContent: null,
    emailHistorySummary: null,
    emailHistoryContext: null,
    calendarAvailability: null,
    writingStyle: null,
    mcpContext: null,
    meetingContext: null,
  } as Parameters<typeof aiDraftReply>[0];
}
