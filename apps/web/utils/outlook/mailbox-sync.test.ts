import { describe, expect, it } from "vitest";
import { decodeMailboxSyncCursor } from "@/utils/email/mailbox-sync";
import { buildOutlookMailboxSyncPage } from "@/utils/outlook/mailbox-sync";
import { parsedMessageMetadata } from "@/utils/mail-api/observations";

describe("buildOutlookMailboxSyncPage", () => {
  it("finishes an initial snapshot when Graph returns a delta cursor", () => {
    const page = buildOutlookMailboxSyncPage({
      response: {
        value: [],
        "@odata.deltaLink":
          "https://graph.microsoft.com/v1.0/me/mailFolders/archive-folder-id/messages/delta?$deltatoken=abc",
      },
      after: "2026-07-01T00:00:00.000Z",
      folderId: "archive-folder-id",
      wasSnapshot: true,
      reset: true,
      categoryMap: new Map(),
      folderIds: { inbox: "inbox-folder-id" },
    });

    expect(page.hasMore).toBe(false);
    expect(decodeMailboxSyncCursor(page.cursor, "microsoft")).toMatchObject({
      provider: "microsoft",
      folderId: "archive-folder-id",
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
            hasAttachments: true,
            flag: { flagStatus: "flagged" },
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
      folderId: "inbox-folder-id",
      wasSnapshot: false,
      reset: false,
      categoryMap: new Map([["To Reply", "category-id"]]),
      folderIds: {
        inbox: "inbox-folder-id",
        archive: "archive-folder-id",
      },
    });

    expect(parsedMessageMetadata(page.upsertedMessages[0]).hasAttachments).toBe(
      true,
    );
    expect(page).toMatchObject({
      deletedMessageIds: ["message-2"],
      hasMore: false,
      removedMessageIds: ["message-3"],
      reset: false,
      upsertedMessages: [
        {
          id: "message-1",
          threadId: "thread-1",
          labelIds: ["UNREAD", "STARRED", "INBOX", "category-id"],
          textHtml: undefined,
          textPlain: undefined,
        },
      ],
    });
    expect(decodeMailboxSyncCursor(page.cursor, "microsoft")).toMatchObject({
      provider: "microsoft",
      folderId: "inbox-folder-id",
      snapshot: false,
    });
  });

  it("maps a moved message to its new folder instead of inbox", () => {
    const page = buildOutlookMailboxSyncPage({
      response: {
        value: [
          {
            id: "message-1",
            conversationId: "thread-1",
            parentFolderId: "archive-folder-id",
            subject: "Archived elsewhere",
            receivedDateTime: "2026-07-31T10:00:00.000Z",
            isRead: true,
          },
        ],
        "@odata.deltaLink":
          "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=abc",
      },
      after: "2026-07-01T00:00:00.000Z",
      folderId: "inbox-folder-id",
      wasSnapshot: false,
      reset: false,
      categoryMap: new Map(),
      folderIds: {
        inbox: "inbox-folder-id",
        archive: "archive-folder-id",
      },
    });

    expect(page.upsertedMessages).toEqual([
      expect.objectContaining({
        id: "message-1",
        labelIds: ["ARCHIVE"],
        parentFolderId: "archive-folder-id",
      }),
    ]);
  });
});
