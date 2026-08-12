import { describe, expect, it } from "vitest";
import type { ListThread } from "./types";
import { isThreadUnread, withThreadReadState } from "./read-state";

describe("thread read state", () => {
  it("removes the unread label from every message", () => {
    const thread = createThread([
      ["INBOX", "UNREAD"],
      ["SENT", "UNREAD"],
    ]);

    const updated = withThreadReadState(thread, true);

    expect(updated.messages.map((message) => message.labelIds)).toEqual([
      ["INBOX"],
      ["SENT"],
    ]);
    expect(isThreadUnread(updated.messages)).toBe(false);
  });

  it("adds the unread label without duplicates", () => {
    const thread = createThread([["INBOX", "UNREAD"], ["INBOX"]]);

    expect(
      withThreadReadState(thread, false).messages.map(
        (message) => message.labelIds,
      ),
    ).toEqual([
      ["INBOX", "UNREAD"],
      ["INBOX", "UNREAD"],
    ]);
  });

  it("preserves a thread that already has the requested state", () => {
    const thread = createThread([["INBOX"]]);

    expect(withThreadReadState(thread, true)).toBe(thread);
  });
});

function createThread(labelIdsByMessage: string[][]): ListThread {
  return {
    id: "thread",
    snippet: "snippet",
    plan: undefined,
    plans: [],
    messages: labelIdsByMessage.map((labelIds, index) => ({
      id: `message-${index}`,
      threadId: "thread",
      snippet: "snippet",
      subject: "Subject",
      date: "0",
      internalDate: "0",
      labelIds,
      headers: { subject: "Subject" },
    })),
  };
}
