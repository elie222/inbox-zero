import { describe, expect, it } from "vitest";
import { toParsedMessageFromThunderbird } from "@/utils/thunderbird/parse-message";

describe("toParsedMessageFromThunderbird", () => {
  it("builds a ParsedMessage with stable ids and headers", () => {
    const message = toParsedMessageFromThunderbird({
      accountEmail: "me@example.com",
      thunderbirdAccountId: "account1",
      thunderbirdMessageId: 42,
      folderPath: "/INBOX",
      subject: "Hello",
      from: "sender@example.com",
      to: "me@example.com",
      textPlain: "Body text here",
      headerMessageId: "<abc@example.com>",
      tags: ["important"],
      read: true,
    });

    expect(message.id).toBe("<abc@example.com>");
    expect(message.threadId).toBe("<abc@example.com>");
    expect(message.headers.from).toBe("sender@example.com");
    expect(message.headers["message-id"]).toBe("<abc@example.com>");
    expect(message.textPlain).toBe("Body text here");
    expect(message.labelIds).toContain("READ");
    expect(message.labelIds).toContain("important");
  });

  it("falls back to thunderbird ids when headers are missing", () => {
    const message = toParsedMessageFromThunderbird({
      accountEmail: "me@example.com",
      thunderbirdAccountId: "account1",
      thunderbirdMessageId: 99,
      from: "a@b.com",
      to: "me@example.com",
      subject: "x",
    });

    expect(message.id).toBe("tb-account1-99");
    expect(message.threadId).toBe("tb-account1-99");
  });
});
