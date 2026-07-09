import { describe, it, expect } from "vitest";
import type { ParsedMessage } from "@/utils/types";
import { selectWritingStyleSampleMessages } from "./select-writing-style-samples";

describe("selectWritingStyleSampleMessages", () => {
  it("keeps only in-thread replies when there are enough of them", () => {
    const replies = Array.from({ length: 6 }, (_, i) => replyMessage(`r${i}`));
    const composed = Array.from({ length: 3 }, (_, i) =>
      composedMessage(`c${i}`),
    );

    const result = selectWritingStyleSampleMessages([...replies, ...composed]);

    expect(result.map((m) => m.id).sort()).toEqual(
      replies.map((m) => m.id).sort(),
    );
  });

  it("falls back to the full pool when too few replies are found", () => {
    const replies = [replyMessage("r0"), replyMessage("r1")];
    const composed = [composedMessage("c0"), composedMessage("c1")];
    const messages = [...replies, ...composed];

    const result = selectWritingStyleSampleMessages(messages);

    expect(result).toHaveLength(messages.length);
  });
});

function replyMessage(id: string): ParsedMessage {
  return baseMessage(
    id,
    `Sounds good.

On Jan 1, 2024, someone@example.com wrote:
> Does tomorrow work?`,
  );
}

function composedMessage(id: string): ParsedMessage {
  return baseMessage(id, "Hey team, just wanted to check in on the project.");
}

function baseMessage(id: string, textPlain: string): ParsedMessage {
  return {
    id,
    threadId: id,
    historyId: id,
    date: "2024-01-01T00:00:00Z",
    snippet: textPlain.slice(0, 50),
    subject: "Test",
    textPlain,
    inline: [],
    headers: {
      date: "2024-01-01T00:00:00Z",
      from: "user@example.com",
      to: "recipient@example.com",
      subject: "Test",
    },
  };
}
