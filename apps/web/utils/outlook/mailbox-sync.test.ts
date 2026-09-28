import { describe, expect, it, vi } from "vitest";
import {
  decodeMailboxSyncCursor,
  encodeMailboxSyncCursor,
} from "@/utils/email/mailbox-sync";
import { createScopedLogger } from "@/utils/logger";
import type { OutlookClient } from "@/utils/outlook/client";
import {
  buildOutlookMailboxSyncPage,
  getOutlookMailboxSyncPage,
} from "@/utils/outlook/mailbox-sync";
import { parsedMessageMetadata } from "@/utils/mail-api/observations";

const logger = createScopedLogger("outlook-mailbox-sync-test");
const DELTA_LINK =
  "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=abc";

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
            inferenceClassification: "other",
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

    expect(parsedMessageMetadata(page.upsertedMessages[0])).toMatchObject({
      hasAttachments: true,
      inboxSection: "other",
    });
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

  it("skips messages that arrive without a conversation", () => {
    const page = buildOutlookMailboxSyncPage({
      response: {
        value: [
          { id: "message-1", isRead: true },
          { id: "message-2", conversationId: "thread-2", isRead: true },
        ],
        "@odata.deltaLink": DELTA_LINK,
      },
      after: "2026-07-01T00:00:00.000Z",
      folderId: "inbox-folder-id",
      wasSnapshot: false,
      reset: false,
      categoryMap: new Map(),
    });

    expect(page.upsertedMessages.map((message) => message.id)).toEqual([
      "message-2",
    ]);
  });
});

describe("getOutlookMailboxSyncPage", () => {
  it("refetches delta messages that omit their conversation", async () => {
    const { client, requestedUrls } = createGraphClient({
      [DELTA_LINK]: {
        value: [
          { id: "partial-message", isRead: true },
          { id: "missing-message", isRead: true },
          { id: "full-message", conversationId: "thread-2", isRead: true },
        ],
        "@odata.deltaLink": DELTA_LINK,
      },
      "/me/messages/partial-message": {
        id: "partial-message",
        conversationId: "thread-1",
        subject: "Complete",
        isRead: true,
      },
    });

    const page = await getOutlookMailboxSyncPage({
      client,
      logger,
      cursor: encodeMailboxSyncCursor({
        version: 1,
        provider: "microsoft",
        deltaLink: DELTA_LINK,
        after: "2026-07-01T00:00:00.000Z",
        snapshot: false,
      }),
      limit: 50,
    });

    expect(page.upsertedMessages).toEqual([
      expect.objectContaining({
        id: "partial-message",
        threadId: "thread-1",
        subject: "Complete",
      }),
      expect.objectContaining({ id: "full-message", threadId: "thread-2" }),
    ]);
    expect(requestedUrls).not.toContain("/me/messages/full-message");
  });
});

function createGraphClient(responses: Record<string, unknown>) {
  const requestedUrls: string[] = [];
  const api = vi.fn((url: string) => {
    requestedUrls.push(url);
    const request = {
      select: () => request,
      header: () => request,
      get: async () => {
        if (url in responses) return responses[url];
        throw Object.assign(new Error("Not found"), {
          statusCode: 404,
          code: "ErrorItemNotFound",
        });
      },
    };
    return request;
  });

  return {
    client: {
      getClient: () => ({ api }),
      getCategoryMapCache: () => new Map(),
      getFolderIdCache: () => ({
        inbox: "inbox-folder-id",
        drafts: "drafts-id",
      }),
    } as unknown as OutlookClient,
    requestedUrls,
  };
}
