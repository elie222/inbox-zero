import { describe, expect, it } from "vitest";
import { parsedMessageMetadata } from "./observations";
import type { ParsedMessage } from "@/utils/types";

describe("parsedMessageMetadata", () => {
  it("maps Gmail system labels into roles and read/starred flags", () => {
    const metadata = parsedMessageMetadata({
      id: "m1",
      threadId: "t1",
      historyId: "1",
      date: "2026-01-01T00:00:00.000Z",
      internalDate: "1735689600000",
      subject: "Hello",
      snippet: "Hi",
      labelIds: ["INBOX", "UNREAD", "STARRED", "CATEGORY_UPDATES", "Label_2"],
      headers: { from: "ada@example.com", to: "me@example.com", date: "" },
      inline: [],
    } as ParsedMessage);
    expect(metadata.roles).toEqual(["inbox"]);
    expect(metadata.read).toBe(false);
    expect(metadata.starred).toBe(true);
    expect(metadata.categoryIds).toEqual(["CATEGORY_UPDATES"]);
    expect(metadata.labelIds).toEqual(["Label_2"]);
  });

  it("maps Outlook folder identity into mailbox roles when labels are absent", () => {
    const metadata = parsedMessageMetadata({
      id: "m2",
      threadId: "t2",
      historyId: "1",
      date: "2026-01-01T00:00:00.000Z",
      parentFolderId: "inbox",
      subject: "Hello",
      snippet: "Hi",
      labelIds: ["UNREAD"],
      headers: { from: "ada@example.com", to: "me@example.com", date: "" },
      inline: [],
    } as ParsedMessage);
    expect(metadata.roles).toEqual(["inbox"]);
    expect(metadata.read).toBe(false);
  });
});
