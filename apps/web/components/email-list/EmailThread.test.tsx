import { describe, expect, it } from "vitest";
import type { ThreadMessage } from "@/components/email-list/types";
import { organizeThreadMessages } from "@/components/email-list/EmailThread";

describe("organizeThreadMessages", () => {
  it("attaches a draft to the message its headers reply to", () => {
    const first = createMessage({
      id: "first",
      messageId: "<first@example.com>",
    });
    const second = createMessage({
      id: "second",
      messageId: "<second@example.com>",
    });
    const draft = createDraft({
      id: "draft",
      inReplyTo: "<first@example.com>",
    });

    const organized = organizeThreadMessages([first, second, draft]);

    expect(organized.map(({ message }) => message.id)).toEqual([
      "first",
      "second",
    ]);
    expect(organized.at(0)?.draftMessages.map((draft) => draft.id)).toEqual([
      "draft",
    ]);
    expect(organized.at(1)?.draftMessages).toEqual([]);
  });

  it("prefers the last entry of the references header", () => {
    const first = createMessage({
      id: "first",
      messageId: "<first@example.com>",
    });
    const second = createMessage({
      id: "second",
      messageId: "<second@example.com>",
    });
    const draft = createDraft({
      id: "draft",
      references: "<first@example.com> <second@example.com>",
    });

    const organized = organizeThreadMessages([first, second, draft]);

    expect(organized.at(1)?.draftMessages.map((draft) => draft.id)).toEqual([
      "draft",
    ]);
  });

  // Outlook thread messages carry no References header and expose In-Reply-To
  // only when full internet headers are fetched, so its drafts arrive with no
  // parent to match. They were previously dropped from the thread entirely.
  it("shows a draft that has no threading headers on the last message", () => {
    const first = createMessage({
      id: "first",
      messageId: "<first@example.com>",
    });
    const second = createMessage({
      id: "second",
      messageId: "<second@example.com>",
    });
    const draft = createDraft({ id: "outlook-draft" });

    const organized = organizeThreadMessages([first, second, draft]);

    expect(organized).toHaveLength(2);
    expect(organized.at(0)?.draftMessages).toEqual([]);
    expect(organized.at(1)?.draftMessages.map((draft) => draft.id)).toEqual([
      "outlook-draft",
    ]);
  });

  it("shows a draft whose parent is not part of the thread", () => {
    const only = createMessage({ id: "only", messageId: "<only@example.com>" });
    const draft = createDraft({
      id: "draft",
      inReplyTo: "<elsewhere@example.com>",
    });

    const organized = organizeThreadMessages([only, draft]);

    expect(organized.at(0)?.draftMessages.map((draft) => draft.id)).toEqual([
      "draft",
    ]);
  });

  it("falls back to the last message when no message id matches the draft's parent", () => {
    const first = createMessage({ id: "first", messageId: undefined });
    const second = createMessage({ id: "second", messageId: undefined });
    const draft = createDraft({
      id: "draft",
      inReplyTo: "<missing@example.com>",
    });

    const organized = organizeThreadMessages([first, second, draft]);

    expect(organized.at(0)?.draftMessages).toEqual([]);
    expect(organized.at(1)?.draftMessages.map((draft) => draft.id)).toEqual([
      "draft",
    ]);
  });

  it("keeps all drafts when several resolve to the same parent", () => {
    const only = createMessage({ id: "only", messageId: "<only@example.com>" });
    const older = createDraft({
      id: "older-draft",
      internalDate: "1000",
    });
    const newer = createDraft({
      id: "newer-draft",
      internalDate: "2000",
    });

    const organized = organizeThreadMessages([only, newer, older]);

    expect(organized).toHaveLength(1);
    expect(organized.at(0)?.draftMessages.map((draft) => draft.id)).toEqual([
      "older-draft",
      "newer-draft",
    ]);
  });

  it("preserves every draft in a draft-only thread", () => {
    const drafts = [
      createDraft({ id: "first" }),
      createDraft({ id: "second" }),
    ];
    expect(
      organizeThreadMessages(drafts).flatMap(
        ({ draftMessages }) => draftMessages,
      ),
    ).toEqual(drafts);
  });

  it("normalizes folded and trailing whitespace in references", () => {
    const first = createMessage({
      id: "first",
      messageId: "<first@example.com>",
    });
    const last = createMessage({ id: "last", messageId: "<last@example.com>" });
    const draft = createDraft({
      id: "draft",
      references: "<older@example.com>\r\n\t<first@example.com>  ",
    });
    expect(
      organizeThreadMessages([first, last, draft])[0].draftMessages,
    ).toEqual([draft]);
  });

  it("handles an empty thread", () => {
    expect(organizeThreadMessages([])).toEqual([]);
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
  internalDate,
}: {
  id: string;
  inReplyTo?: string;
  references?: string;
  internalDate?: string;
}): ThreadMessage {
  return {
    id,
    threadId: "thread",
    labelIds: ["DRAFT"],
    headers: { "in-reply-to": inReplyTo, references },
    internalDate,
  } as unknown as ThreadMessage;
}
