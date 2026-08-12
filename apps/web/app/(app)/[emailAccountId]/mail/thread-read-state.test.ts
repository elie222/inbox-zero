import { describe, expect, it } from "vitest";
import type { ListThread } from "./types";
import { isThreadUnread, markThreadRead } from "./thread-read-state";

describe("thread read state", () => {
  it("removes the unread label from every message", () => {
    const thread = createThread([
      ["INBOX", "UNREAD"],
      ["SENT", "UNREAD"],
    ]);

    const updated = markThreadRead(thread);

    expect(updated.messages.map((message) => message.labelIds)).toEqual([
      ["INBOX"],
      ["SENT"],
    ]);
    expect(isThreadUnread(updated)).toBe(false);
  });

  it("preserves an already-read thread", () => {
    const thread = createThread([["INBOX"]]);

    expect(markThreadRead(thread)).toBe(thread);
    expect(isThreadUnread(thread)).toBe(false);
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
