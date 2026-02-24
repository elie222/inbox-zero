import { describe, expect, it, vi } from "vitest";
import type { ModelMessage } from "ai";

vi.mock("@/utils/llms/model", () => ({
  getModel: vi.fn(),
}));

vi.mock("@/utils/llms", () => ({
  createGenerateText: vi.fn(),
  createGenerateObject: vi.fn(),
}));

import { estimateTokens, shouldCompact } from "@/utils/ai/assistant/compact";

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
});
