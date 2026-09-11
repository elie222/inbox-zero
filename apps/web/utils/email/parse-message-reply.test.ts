import { describe, expect, it, vi } from "vitest";
import type { ParsedMessage } from "@/utils/types";
import { parseMessageReply } from "./parse-message-reply";

vi.mock("server-only", () => ({}));

describe("parseMessageReply", () => {
  it("removes quoted replies from plain text messages", () => {
    const message = createMessage({
      textPlain:
        "Fresh reply\n\nOn Tue, Apr 28, 2026 at 1:10 PM, Sender <sender@example.com> wrote:\n\n> Older quoted line",
    });

    expect(parseMessageReply(message).textPlain).toBe("Fresh reply");
  });

  it("removes Gmail quote containers before converting HTML", () => {
    const message = createMessage({
      textPlain: "",
      textHtml:
        '<div>Fresh reply</div><div class="gmail_quote gmail_quote_container"><div class="gmail_attr">Le lun. 27 avr. 2026, Sender a écrit:</div><blockquote class="gmail_quote"><div>Older quoted line</div></blockquote></div>',
    });

    expect(parseMessageReply(message)).toMatchObject({
      textPlain: "Fresh reply",
      textHtml: "Fresh reply",
    });
  });
});

function createMessage(overrides: Partial<ParsedMessage> = {}): ParsedMessage {
  return {
    date: "2026-04-28T13:10:00.000Z",
    headers: {
      date: "2026-04-28T13:10:00.000Z",
      from: "sender@example.com",
      subject: "Re: Update",
      to: "me@example.com",
    },
    historyId: "history-1",
    id: "message-1",
    inline: [],
    snippet: "Fresh reply",
    subject: "Re: Update",
    threadId: "thread-1",
    ...overrides,
  };
}
