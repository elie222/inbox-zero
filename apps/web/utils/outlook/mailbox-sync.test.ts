import { describe, expect, it } from "vitest";
import { decodeMailboxSyncCursor } from "@/utils/email/mailbox-sync";
import { buildOutlookMailboxSyncPage } from "@/utils/outlook/mailbox-sync";

describe("buildOutlookMailboxSyncPage", () => {
  it("finishes an initial snapshot when Graph returns a delta cursor", () => {
    const page = buildOutlookMailboxSyncPage({
      response: {
        value: [],
        "@odata.deltaLink":
          "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=abc",
      },
      after: "2026-07-01T00:00:00.000Z",
      wasSnapshot: true,
      reset: true,
      categoryMap: new Map(),
    });

    expect(page.hasMore).toBe(false);
    expect(decodeMailboxSyncCursor(page.cursor, "microsoft")).toMatchObject({
      provider: "microsoft",
      snapshot: false,
    });
  });

  it("returns metadata upserts, removals, and a validated delta cursor", () => {
    const page = buildOutlookMailboxSyncPage({
      response: {
        value: [
          {
            id: "message-1",
            conversationId: "thread-1",
            parentFolderId: "inbox-folder-id",
            subject: "Updated subject",
            bodyPreview: "Preview",
            receivedDateTime: "2026-07-31T10:00:00.000Z",
            isRead: false,
            categories: ["To Reply"],
          },
          {
            id: "message-2",
            "@removed": { reason: "deleted" },
          },
          {
            id: "message-3",
            conversationId: "thread-3",
            parentFolderId: "inbox-folder-id",
            subject: "Stale version",
          },
          {
            id: "message-3",
            "@removed": { reason: "changed" },
          },
        ],
        "@odata.deltaLink":
          "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=abc",
      },
      after: "2026-07-01T00:00:00.000Z",
      wasSnapshot: false,
      reset: false,
      categoryMap: new Map([["To Reply", "category-id"]]),
    });

    expect(page).toMatchObject({
      deletedMessageIds: ["message-2", "message-3"],
      hasMore: false,
      reset: false,
      upsertedMessages: [
        {
          id: "message-1",
          threadId: "thread-1",
          labelIds: ["UNREAD", "INBOX", "category-id"],
          textHtml: undefined,
          textPlain: undefined,
        },
      ],
    });
    expect(decodeMailboxSyncCursor(page.cursor, "microsoft")).toMatchObject({
      provider: "microsoft",
      snapshot: false,
    });
  });
});
