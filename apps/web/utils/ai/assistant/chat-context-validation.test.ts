import { describe, expect, it } from "vitest";
import { messageContextSchema } from "./chat-context-validation";

describe("reader email context", () => {
  it("bounds email content and drops attachment metadata before sending it", () => {
    const oversized = "x".repeat(50_000);
    const context = messageContextSchema.parse({
      type: "email",
      message: {
        id: oversized,
        threadId: oversized,
        snippet: oversized,
        textPlain: oversized,
        textHtml: oversized,
        headers: {
          from: oversized,
          to: oversized,
          subject: oversized,
          date: oversized,
        },
        attachments: [{ content: oversized }],
      },
    });
    expect(context.message.id).toHaveLength(1000);
    expect(context.message.headers.subject).toHaveLength(1000);
    expect(context.message.textPlain).toHaveLength(12_000);
    expect(context.message).not.toHaveProperty("attachments");
    expect(JSON.stringify(context).length).toBeLessThan(35_000);
  });
  it("keeps astral characters intact at field boundaries", () => {
    const context = messageContextSchema.parse({
      type: "email",
      message: {
        id: "message",
        threadId: "thread",
        snippet: "",
        textPlain: `${"a".repeat(11_999)}😀end`,
        headers: {
          from: "sender@example.com",
          to: "me@example.com",
          subject: `${"b".repeat(999)}😀end`,
          date: "",
        },
      },
    });
    expect(context.message.textPlain).toBe("a".repeat(11_999));
    expect(context.message.headers.subject).toBe("b".repeat(999));
  });
});
