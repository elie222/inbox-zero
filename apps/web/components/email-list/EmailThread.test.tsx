import { describe, expect, it } from "vitest";
import type { ThreadMessage } from "@/components/email-list/types";
import { organizeThreadMessages } from "@/components/email-list/EmailThread";

describe("organizeThreadMessages", () => {
  it("attaches a draft to the message its headers reply to", () => {
    const first = createMessage({ id: "first", messageId: "<first@mail>" });
    const second = createMessage({ id: "second", messageId: "<second@mail>" });
    const draft = createDraft({ id: "draft", inReplyTo: "<first@mail>" });

    const organized = organizeThreadMessages([first, second, draft]);

    expect(organized.map(({ message }) => message.id)).toEqual([
      "first",
      "second",
    ]);
    expect(organized[0]?.draftMessage?.id).toBe("draft");
    expect(organized[1]?.draftMessage).toBeUndefined();
  });

  it("prefers the last entry of the references header", () => {
    const first = createMessage({ id: "first", messageId: "<first@mail>" });
    const second = createMessage({ id: "second", messageId: "<second@mail>" });
    const draft = createDraft({
      id: "draft",
      references: "<first@mail> <second@mail>",
    });

    const organized = organizeThreadMessages([first, second, draft]);

    expect(organized[1]?.draftMessage?.id).toBe("draft");
  });

  // Outlook thread messages carry no References header and expose In-Reply-To
  // only when full internet headers are fetched, so its drafts arrive with no
  // parent to match. They were previously dropped from the thread entirely.
  it("shows a draft that has no threading headers on the last message", () => {
    const first = createMessage({ id: "first", messageId: "<first@mail>" });
    const second = createMessage({ id: "second", messageId: "<second@mail>" });
    const draft = createDraft({ id: "outlook-draft" });

    const organized = organizeThreadMessages([first, second, draft]);

    expect(organized).toHaveLength(2);
    expect(organized[0]?.draftMessage).toBeUndefined();
    expect(organized[1]?.draftMessage?.id).toBe("outlook-draft");
  });

  it("shows a draft whose parent is not part of the thread", () => {
    const only = createMessage({ id: "only", messageId: "<only@mail>" });
    const draft = createDraft({ id: "draft", inReplyTo: "<elsewhere@mail>" });

    const organized = organizeThreadMessages([only, draft]);

    expect(organized[0]?.draftMessage?.id).toBe("draft");
  });

  it("does not attach a draft to messages that lack a message id", () => {
    const first = createMessage({ id: "first", messageId: undefined });
    const second = createMessage({ id: "second", messageId: undefined });
    const draft = createDraft({ id: "draft", inReplyTo: "<missing@mail>" });

    const organized = organizeThreadMessages([first, second, draft]);

    expect(organized[0]?.draftMessage).toBeUndefined();
    expect(organized[1]?.draftMessage?.id).toBe("draft");
  });

  it("returns nothing for a thread that holds only a draft", () => {
    expect(organizeThreadMessages([createDraft({ id: "draft" })])).toEqual([]);
  });

  it("handles a missing message list", () => {
    expect(organizeThreadMessages(undefined)).toEqual([]);
  });
});

function createMessage({
  id,
  messageId,
}: {
  id: string;
  messageId?: string;
}): ThreadMessage {
  return {
    id,
    threadId: "thread",
    labelIds: ["INBOX"],
    headers: { "message-id": messageId },
  } as unknown as ThreadMessage;
}

function createDraft({
  id,
  inReplyTo,
  references,
}: {
  id: string;
  inReplyTo?: string;
  references?: string;
}): ThreadMessage {
  return {
    id,
    threadId: "thread",
    labelIds: ["DRAFT"],
    headers: { "in-reply-to": inReplyTo, references },
  } as unknown as ThreadMessage;
}
