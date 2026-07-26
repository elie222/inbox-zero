import { describe, expect, it } from "vitest";
import {
  emailMessageToParsedMessage,
  reviewItemToParsedMessage,
} from "./load-stored-message";

describe("thunderbird stored message helpers", () => {
  it("maps review items into ParsedMessage for chat/assistant reads", () => {
    const message = reviewItemToParsedMessage({
      messageId: "tb-1",
      threadId: "thread-1",
      subject: "Invoice ready",
      from: "billing@example.com",
      to: "me@example.com",
      snippet: "Your invoice",
      textPlain: "Please find your invoice attached.",
      messageDate: new Date("2026-07-01T12:00:00.000Z"),
      thunderbirdMessageId: 99,
      thunderbirdAccountId: "account1",
    });

    expect(message).toMatchObject({
      id: "tb-1",
      threadId: "thread-1",
      subject: "Invoice ready",
      snippet: "Your invoice",
      textPlain: "Please find your invoice attached.",
      headers: {
        from: "billing@example.com",
        to: "me@example.com",
      },
    });
  });

  it("maps EmailMessage rows into ParsedMessage fallbacks", () => {
    const message = emailMessageToParsedMessage({
      messageId: "em-1",
      threadId: "thread-2",
      from: "news@example.com",
      fromName: "Weekly News",
      to: "me@example.com",
      date: new Date("2026-07-02T12:00:00.000Z"),
      read: false,
      sent: false,
      inbox: true,
    });

    expect(message.id).toBe("em-1");
    expect(message.headers.from).toContain("news@example.com");
    expect(message.labelIds).toContain("INBOX");
  });
});
