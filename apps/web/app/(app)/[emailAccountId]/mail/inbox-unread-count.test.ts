import { describe, expect, it } from "vitest";
import type { ListThread } from "./types";
import { getInboxUnreadDelta } from "./inbox-unread-count";

describe("getInboxUnreadDelta", () => {
  it("decrements only unread inbox conversations marked as read", () => {
    const threads = [
      createThread("unread-inbox", ["INBOX", "UNREAD"]),
      createThread("read-inbox", ["INBOX"]),
      createThread("unread-archive", ["UNREAD"]),
    ];

    expect(
      getInboxUnreadDelta({
        read: true,
        threadKeys: threads.map((thread) => thread.id),
        threads,
      }),
    ).toBe(-1);
  });

  it("increments only read inbox conversations marked as unread", () => {
    const threads = [
      createThread("read-inbox", ["INBOX"]),
      createThread("unread-inbox", ["INBOX", "UNREAD"]),
    ];

    expect(
      getInboxUnreadDelta({
        read: false,
        threadKeys: threads.map((thread) => thread.id),
        threads,
      }),
    ).toBe(1);
  });

  it("counts each unread Outlook inbox message", () => {
    const thread = createThread("outlook", ["UNREAD"], "outlook-inbox", 2);

    expect(
      getInboxUnreadDelta({
        countByMessage: true,
        inboxFolderId: "outlook-inbox",
        read: true,
        threadKeys: [thread.id],
        threads: [thread],
      }),
    ).toBe(-2);
  });
});

function createThread(
  id: string,
  labelIds: string[],
  parentFolderId?: string,
  messageCount = 1,
): ListThread {
  return {
    id,
    snippet: "snippet",
    plan: undefined,
    plans: [],
    messages: Array.from({ length: messageCount }, (_, index) => ({
      id: `message-${id}-${index}`,
      threadId: id,
      snippet: "snippet",
      subject: "Subject",
      date: "0",
      internalDate: "0",
      labelIds,
      parentFolderId,
      headers: { subject: "Subject" },
    })),
  };
}
