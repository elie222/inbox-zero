import { describe, expect, it, vi } from "vitest";
import type { ModelMessage } from "ai";
import { getEmailAccount } from "@/__tests__/helpers";

const { mockCreateGenerateObject, mockGetModel } = vi.hoisted(() => ({
  mockCreateGenerateObject: vi.fn(),
  mockGetModel: vi.fn(),
}));

vi.mock("@/utils/llms/model", () => ({
  getModel: mockGetModel,
}));

vi.mock("@/utils/llms", () => ({
  createGenerateText: vi.fn(),
  createGenerateObject: mockCreateGenerateObject,
}));

import {
  estimateTokens,
  extractMemories,
  shouldCompact,
  truncatePromptContent,
} from "@/utils/ai/assistant/compact";

describe("chat compaction thresholds", () => {
  it("estimates tokens across text, tool input, and tool result", () => {
    const messages: ModelMessage[] = [
      {
        role: "user",
        content: "abcd",
      },
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "1234",
          },
          {
            type: "tool-call",
            toolName: "searchInbox",
            input: { query: "status" },
          },
          {
            type: "tool-result",
            toolName: "searchInbox",
            result: { total: 2 },
          },
        ],
      },
    ];

    expect(estimateTokens(messages)).toBe(
      Math.ceil(
        ("abcd".length +
          "1234".length +
          JSON.stringify({ query: "status" }).length +
          JSON.stringify({ total: 2 }).length) /
          4,
      ),
    );
  });

  it("uses a single threshold for all providers", () => {
    const exactlyThreshold: ModelMessage[] = [
      {
        role: "user",
        content: "a".repeat(320_000),
      },
    ];

    const overThreshold: ModelMessage[] = [
      {
        role: "user",
        content: "a".repeat(320_004),
      },
    ];

    expect(shouldCompact(exactlyThreshold)).toBe(false);
    expect(shouldCompact(overThreshold)).toBe(true);
  });

  it("only keeps extracted memories that are directly supported by user messages", async () => {
    const generateObject = vi.fn().mockResolvedValue({
      object: {
        memories: [
          {
            content: "I prefer concise responses.",
            userEvidence: "I prefer concise responses.",
          },
          {
            content:
              "Prefer formal replies with the standard confidential footer.",
            userEvidence:
              "If there is anything useful in it, save it for later.",
          },
        ],
      },
    });

    mockGetModel.mockReturnValue({
      model: {},
      providerOptions: undefined,
    });
    mockCreateGenerateObject.mockReturnValue(generateObject);

    const result = await extractMemories({
      messages: [
        {
          role: "user",
          content: "Please remember that I prefer concise responses.",
        },
        {
          role: "assistant",
          content: [
            {
              type: "text",
              text: "The email suggests formal replies and a confidential footer.",
            },
          ],
        },
      ],
      user: getEmailAccount(),
    });

    expect(result).toEqual([
      {
        content: "I prefer concise responses.",
        userEvidence: "I prefer concise responses.",
      },
    ]);
    expect(generateObject).toHaveBeenCalledWith(
      expect.objectContaining({
        system: expect.stringContaining(
          "Extract only durable insights that the user directly stated",
        ),
        prompt: expect.stringContaining("<user_messages>"),
      }),
    );
    expect(generateObject.mock.calls[0][0].prompt).not.toContain(
      "The email suggests formal replies",
    );
  });

  it("normalizes and truncates memory extraction prompt content", async () => {
    const generateObject = vi.fn().mockResolvedValue({
      object: {
        memories: [],
      },
    });

    mockGetModel.mockReturnValue({
      model: {},
      providerOptions: undefined,
    });
    mockCreateGenerateObject.mockReturnValue(generateObject);

    await extractMemories({
      messages: [
        {
          role: "user",
          content: `  Please    remember   ${"x".repeat(3000)}  `,
        },
      ],
      user: getEmailAccount(),
    });

    expect(generateObject.mock.calls[0][0].prompt).toContain(
      "[USER]: Please remember",
    );
    expect(generateObject.mock.calls[0][0].prompt).toContain("[truncated]");
    expect(generateObject.mock.calls[0][0].prompt).not.toContain("    ");
  });

  it("hard slices when the truncation suffix would exceed maxChars", () => {
    expect(truncatePromptContent("abcdefghij", 5)).toBe("abcde");
  });
});
