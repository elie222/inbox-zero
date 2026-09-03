import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearEmailCache,
  clearEmailCacheForAccount,
  getEmailCacheDatabase,
} from "./database";
import {
  applyMailboxSyncPage,
  markSyncedMailboxThreadsRead,
  readCombinedSyncedMailboxThreads,
  readMailboxSyncState,
  readSyncedMailboxThreads,
  removeSyncedMailboxThreads,
  subscribeToMailboxStore,
} from "./mailbox";
import { writeCachedThreadList } from "./thread-lists";
import type { ParsedMessage } from "@/utils/types";

describe("synced mailbox cache", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    await clearEmailCache();
  });

  it("applies snapshots and deltas atomically with their cursor", async () => {
    const first = getMessage({
      id: "message-1",
      threadId: "thread-1",
      internalDate: "2026-08-20T10:00:00.000Z",
    });
    await applyMailboxSyncPage({
      emailAccountId: "account-1",
      after: new Date("2026-07-24T00:00:00.000Z"),
      now: 100,
      page: {
        cursor: "cursor-1",
        deletedMessageIds: [],
        hasMore: true,
        reset: true,
        upsertedMessages: [first],
      },
    });

    await applyMailboxSyncPage({
      emailAccountId: "account-1",
      now: 200,
      page: {
        cursor: "cursor-2",
        deletedMessageIds: [first.id],
        hasMore: false,
        reset: false,
        upsertedMessages: [
          getMessage({
            id: "message-2",
            threadId: "thread-2",
            internalDate: "2026-08-21T10:00:00.000Z",
          }),
        ],
      },
    });

    await expect(readMailboxSyncState("account-1")).resolves.toEqual({
      after: "2026-07-24T00:00:00.000Z",
      completedAt: 200,
      cursor: "cursor-2",
      emailAccountId: "account-1",
      hasMore: false,
      lastSyncedAt: 200,
    });
    await expect(
      readSyncedMailboxThreads({
        emailAccountId: "account-1",
        query: { type: "inbox" },
      }),
    ).resolves.toMatchObject({
      complete: true,
      syncedAt: 200,
      threads: [{ id: "thread-2" }],
    });
  });

  it("replaces account messages when the provider requests a reset", async () => {
    await applyMailboxSyncPage({
      emailAccountId: "account-1",
      after: new Date("2026-07-24T00:00:00.000Z"),
      page: {
        cursor: "old",
        deletedMessageIds: [],
        hasMore: false,
        reset: true,
        upsertedMessages: [getMessage({ id: "old", threadId: "old-thread" })],
      },
    });
    await applyMailboxSyncPage({
      emailAccountId: "account-1",
      after: new Date("2026-07-25T00:00:00.000Z"),
      page: {
        cursor: "new",
        deletedMessageIds: [],
        hasMore: false,
        reset: true,
        upsertedMessages: [getMessage({ id: "new", threadId: "new-thread" })],
      },
    });

    const snapshot = await readSyncedMailboxThreads({
      emailAccountId: "account-1",
      query: { type: "inbox" },
    });
    expect(snapshot?.threads.map((thread) => thread.id)).toEqual([
      "new-thread",
    ]);
    expect(snapshot?.after).toBe("2026-07-25T00:00:00.000Z");
  });

  it("filters inbox rows and gives malformed dates a valid cleanup key", async () => {
    const dateFallback = getMessage({
      id: "date-fallback",
      threadId: "valid-thread",
    });
    dateFallback.internalDate = "invalid";
    dateFallback.date = "2026-08-22T10:00:00.000Z";
    const nowFallback = getMessage({
      id: "now-fallback",
      threadId: "non-inbox-thread",
      internalDate: "invalid",
      labelIds: [],
    });
    nowFallback.date = "invalid";
    const missingLabels = getMessage({
      id: "missing-labels",
      threadId: "missing-label-thread",
    });
    missingLabels.labelIds = undefined;

    await applyMailboxSyncPage({
      emailAccountId: "account-1",
      after: new Date("2026-07-24T00:00:00.000Z"),
      now: 500,
      page: {
        cursor: "cursor",
        deletedMessageIds: [],
        hasMore: false,
        reset: true,
        upsertedMessages: [dateFallback, nowFallback, missingLabels],
      },
    });

    await expect(
      readSyncedMailboxThreads({
        emailAccountId: "account-1",
        query: { type: "inbox" },
      }),
    ).resolves.toMatchObject({ threads: [{ id: "valid-thread" }] });
    const database = await getEmailCacheDatabase();
    await expect(
      database?.get("mailboxMessages", ["account-1", "date-fallback"]),
    ).resolves.toMatchObject({
      receivedAt: new Date("2026-08-22T10:00:00.000Z").getTime(),
    });
    await expect(
      database?.get("mailboxMessages", ["account-1", "now-fallback"]),
    ).resolves.toMatchObject({ receivedAt: 500 });
  });

  it("derives sorted inbox and split views while preserving server plans", async () => {
    const plan = { id: "execution-1", rule: { id: "rule-1" } };
    const participantMessages = [
      {
        headers: {
          from: "Dana Example <dana@example.com>",
          to: "user@example.com",
        },
      },
      {
        headers: {
          from: "user@example.com",
          to: "Dana Example <dana@example.com>",
        },
      },
    ];
    await writeCachedThreadList({
      emailAccountId: "account-1",
      viewKey: "existing-view",
      hasMore: false,
      threads: [
        {
          id: "thread-2",
          messages: [
            {
              date: "2026-08-19T10:00:00.000Z",
              headers: {
                date: "2026-08-19T10:00:00.000Z",
                from: "Earlier <earlier@example.com>",
                subject: "earlier subject",
                to: "user@example.com",
              },
              id: "earlier-message",
              internalDate: "2026-08-19T10:00:00.000Z",
              snippet: "earlier snippet",
              subject: "earlier subject",
              threadId: "thread-2",
            },
          ],
          participantMessages,
          plan,
          plans: [plan],
          snippet: "old",
        },
      ],
    });
    await applyMailboxSyncPage({
      emailAccountId: "account-1",
      after: new Date("2026-07-24T00:00:00.000Z"),
      now: 300,
      page: {
        cursor: "cursor",
        deletedMessageIds: [],
        hasMore: false,
        reset: true,
        upsertedMessages: [
          getMessage({
            id: "message-1",
            threadId: "thread-1",
            internalDate: "2026-08-20T10:00:00.000Z",
            labelIds: ["INBOX", "UNREAD", "CATEGORY_UPDATES"],
          }),
          getMessage({
            id: "message-2",
            threadId: "thread-2",
            internalDate: "2026-08-22T10:00:00.000Z",
            labelIds: ["INBOX", "UNREAD", "CATEGORY_UPDATES"],
          }),
          getMessage({
            id: "message-3",
            threadId: "thread-2",
            internalDate: "2026-08-23T10:00:00.000Z",
            labelIds: ["INBOX", "CATEGORY_UPDATES"],
          }),
          getMessage({
            id: "ignored-message",
            threadId: "ignored-thread",
            from: "Reminder <reminder@superhuman.com>",
            internalDate: "2026-08-23T11:00:00.000Z",
            labelIds: ["INBOX", "CATEGORY_UPDATES"],
          }),
        ],
      },
    });

    const snapshot = await readSyncedMailboxThreads({
      emailAccountId: "account-1",
      query: { type: "CATEGORY_UPDATES" },
      limit: 20,
    });

    expect(snapshot?.threads.map((thread) => thread.id)).toEqual([
      "thread-2",
      "thread-1",
    ]);
    expect(snapshot?.complete).toBe(false);
    expect(snapshot?.threads[0]).toMatchObject({
      id: "thread-2",
      participantMessages,
      plan,
      plans: [plan],
      snippet: "message-3 snippet",
    });
    expect(snapshot?.threads[0]?.messages.map((message) => message.id)).toEqual(
      ["earlier-message", "message-2", "message-3"],
    );

    const limitedInbox = await readSyncedMailboxThreads({
      emailAccountId: "account-1",
      query: { type: "inbox" },
      limit: 1,
    });
    expect(limitedInbox).toMatchObject({
      truncated: true,
      threads: [{ id: "thread-2" }],
    });

    const limitedCategory = await readSyncedMailboxThreads({
      emailAccountId: "account-1",
      query: { type: "CATEGORY_UPDATES" },
      limit: 1,
    });
    expect(limitedCategory).toMatchObject({
      truncated: true,
      threads: [{ id: "thread-2" }],
    });
  });

  it("falls back to the server when a sparse local query exceeds its scan budget", async () => {
    await applyMailboxSyncPage({
      emailAccountId: "account-1",
      after: new Date("2026-07-24T00:00:00.000Z"),
      page: {
        cursor: "cursor",
        deletedMessageIds: [],
        hasMore: false,
        reset: true,
        upsertedMessages: Array.from({ length: 501 }, (_, index) =>
          getMessage({
            id: `message-${index}`,
            threadId: "large-thread",
            internalDate: new Date(
              Date.UTC(2026, 7, 23, 12, 0, 0) - index * 1000,
            ).toISOString(),
            labelIds: ["INBOX"],
          }),
        ),
      },
    });

    await expect(
      readSyncedMailboxThreads({
        emailAccountId: "account-1",
        query: { type: "CATEGORY_UPDATES" },
      }),
    ).resolves.toBeUndefined();
  });

  it("supports unread, sender, label, folder, and date filters", async () => {
    await applyMailboxSyncPage({
      emailAccountId: "account-1",
      after: new Date("2026-07-24T00:00:00.000Z"),
      page: {
        cursor: "cursor",
        deletedMessageIds: [],
        hasMore: false,
        reset: true,
        upsertedMessages: [
          getMessage({
            id: "match",
            threadId: "matching-thread",
            from: "Person <person@example.com>",
            internalDate: "2026-08-22T10:00:00.000Z",
            labelIds: ["INBOX", "UNREAD", "custom-label"],
            parentFolderId: "folder-1",
          }),
          getMessage({
            id: "miss",
            threadId: "other-thread",
            internalDate: "2026-08-19T10:00:00.000Z",
            labelIds: ["INBOX"],
            parentFolderId: "folder-2",
          }),
        ],
      },
    });

    const snapshot = await readSyncedMailboxThreads({
      emailAccountId: "account-1",
      query: {
        after: new Date("2026-08-21T00:00:00.000Z"),
        before: new Date("2026-08-23T00:00:00.000Z"),
        folderId: "folder-1",
        fromEmail: "person@example.com",
        isUnread: true,
        labelId: "custom-label",
      },
    });

    expect(snapshot?.threads.map((thread) => thread.id)).toEqual([
      "matching-thread",
    ]);
  });

  it("falls back for views the inbox snapshot cannot answer correctly", async () => {
    await applyMailboxSyncPage({
      emailAccountId: "account-1",
      after: new Date("2026-07-24T00:00:00.000Z"),
      page: {
        cursor: "cursor",
        deletedMessageIds: [],
        hasMore: false,
        reset: true,
        upsertedMessages: [],
      },
    });

    await expect(
      readSyncedMailboxThreads({
        emailAccountId: "account-1",
        query: { type: "sent" },
      }),
    ).resolves.toBeUndefined();
    await expect(
      readSyncedMailboxThreads({
        emailAccountId: "account-1",
        query: { inboxSection: "focused", type: "inbox" },
      }),
    ).resolves.toBeUndefined();
  });

  it("reconciles read and removal mutations into the canonical store", async () => {
    const mutationMessages = Array.from({ length: 51 }, (_, index) =>
      getMessage({
        id: `message-${index}`,
        threadId: `thread-${index}`,
        labelIds: ["INBOX", "UNREAD"],
      }),
    );
    const mutationThreadIds = mutationMessages.map(
      (message) => message.threadId,
    );
    await applyMailboxSyncPage({
      emailAccountId: "account-1",
      after: new Date("2026-07-24T00:00:00.000Z"),
      page: {
        cursor: "cursor",
        deletedMessageIds: [],
        hasMore: false,
        reset: true,
        upsertedMessages: mutationMessages,
      },
    });

    await markSyncedMailboxThreadsRead({
      emailAccountId: "account-1",
      read: true,
      threadIds: [...mutationThreadIds, "thread-0"],
    });
    await expect(
      readSyncedMailboxThreads({
        emailAccountId: "account-1",
        query: { isUnread: true, type: "inbox" },
      }),
    ).resolves.toMatchObject({ threads: [] });

    await removeSyncedMailboxThreads({
      emailAccountId: "account-1",
      threadIds: mutationThreadIds,
    });
    await expect(
      readSyncedMailboxThreads({
        emailAccountId: "account-1",
        query: { type: "inbox" },
      }),
    ).resolves.toMatchObject({ threads: [] });
  });

  it("clears mailbox data for one account without affecting another", async () => {
    for (const emailAccountId of ["account-1", "account-2"]) {
      await applyMailboxSyncPage({
        emailAccountId,
        after: new Date("2026-07-24T00:00:00.000Z"),
        page: {
          cursor: `${emailAccountId}-cursor`,
          deletedMessageIds: [],
          hasMore: false,
          reset: true,
          upsertedMessages: [
            getMessage({
              id: `${emailAccountId}-message`,
              threadId: `${emailAccountId}-thread`,
            }),
          ],
        },
      });
    }

    await clearEmailCacheForAccount("account-1");

    await expect(readMailboxSyncState("account-1")).resolves.toBeUndefined();
    await expect(
      readSyncedMailboxThreads({
        emailAccountId: "account-1",
        query: { type: "inbox" },
      }),
    ).resolves.toBeUndefined();
    await expect(readMailboxSyncState("account-2")).resolves.toMatchObject({
      cursor: "account-2-cursor",
    });
    await expect(
      readSyncedMailboxThreads({
        emailAccountId: "account-2",
        query: { type: "inbox" },
      }),
    ).resolves.toMatchObject({ threads: [{ id: "account-2-thread" }] });
  });

  it("merges account snapshots by composite thread key and global recency", async () => {
    await applyMailboxSyncPage({
      emailAccountId: "account-1",
      after: new Date("2026-07-24T00:00:00.000Z"),
      now: 100,
      page: {
        cursor: "account-1-cursor",
        deletedMessageIds: [],
        hasMore: false,
        reset: true,
        upsertedMessages: [
          getMessage({
            id: "account-1-message",
            threadId: "shared-thread",
            internalDate: "2026-08-22T10:00:00.000Z",
          }),
        ],
      },
    });
    await applyMailboxSyncPage({
      emailAccountId: "account-2",
      after: new Date("2026-07-24T00:00:00.000Z"),
      now: 200,
      page: {
        cursor: "account-2-cursor",
        deletedMessageIds: [],
        hasMore: false,
        reset: true,
        upsertedMessages: [
          getMessage({
            id: "account-2-message",
            threadId: "shared-thread",
            internalDate: "2026-08-23T10:00:00.000Z",
          }),
        ],
      },
    });

    const snapshot = await readCombinedSyncedMailboxThreads({
      accounts: [getAccount("account-1"), getAccount("account-2")],
      query: { type: "inbox" },
      limit: 20,
    });

    expect(snapshot).toMatchObject({
      accountStates: {
        "account-1": {
          after: "2026-07-24T00:00:00.000Z",
          complete: true,
          truncated: false,
        },
        "account-2": {
          after: "2026-07-24T00:00:00.000Z",
          complete: true,
          truncated: false,
        },
      },
      complete: true,
      missingAccountIds: [],
      truncated: false,
    });
    expect(
      snapshot?.threads.map((thread) => [thread.account.id, thread.id]),
    ).toEqual([
      ["account-2", "shared-thread"],
      ["account-1", "shared-thread"],
    ]);

    const truncatedSnapshot = await readCombinedSyncedMailboxThreads({
      accounts: [getAccount("account-1"), getAccount("account-2")],
      query: { type: "inbox" },
      limit: 1,
    });
    expect(truncatedSnapshot).toMatchObject({
      truncated: true,
      threads: [
        { account: { id: "account-2" }, id: "shared-thread" },
        { account: { id: "account-1" }, id: "shared-thread" },
      ],
    });
  });

  it("returns available unread rows while another account is not cached", async () => {
    await applyMailboxSyncPage({
      emailAccountId: "account-1",
      after: new Date("2026-07-24T00:00:00.000Z"),
      page: {
        cursor: "account-1-cursor",
        deletedMessageIds: [],
        hasMore: false,
        reset: true,
        upsertedMessages: [
          getMessage({
            id: "read-message",
            threadId: "read-thread",
            internalDate: "2026-08-23T11:00:00.000Z",
          }),
          getMessage({
            id: "unread-message",
            threadId: "unread-thread",
            internalDate: "2026-08-23T10:00:00.000Z",
            labelIds: ["INBOX", "UNREAD"],
          }),
        ],
      },
    });

    const snapshot = await readCombinedSyncedMailboxThreads({
      accounts: [getAccount("account-1"), getAccount("account-2")],
      query: { type: "unread" },
      limit: 20,
    });

    expect(snapshot).toMatchObject({
      accountStates: { "account-1": { complete: true } },
      complete: false,
      missingAccountIds: ["account-2"],
      truncated: false,
    });
    expect(snapshot?.threads).toMatchObject([
      { account: { id: "account-1" }, id: "unread-thread" },
    ]);
  });

  it("notifies active subscribers after mailbox changes", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToMailboxStore(listener);
    await applyMailboxSyncPage({
      emailAccountId: "account-1",
      after: new Date("2026-07-24T00:00:00.000Z"),
      page: {
        cursor: "cursor",
        deletedMessageIds: [],
        hasMore: false,
        reset: true,
        upsertedMessages: [
          getMessage({ id: "message-1", threadId: "thread-1" }),
        ],
      },
    });
    expect(listener).toHaveBeenCalledWith("account-1");

    unsubscribe();
    await markSyncedMailboxThreadsRead({
      emailAccountId: "account-1",
      read: true,
      threadIds: ["thread-1"],
    });
    expect(listener).toHaveBeenCalledOnce();
  });
});

function getMessage({
  id,
  threadId,
  from = "Sender <sender@example.com>",
  internalDate = "2026-08-23T10:00:00.000Z",
  labelIds = ["INBOX"],
  parentFolderId,
}: {
  id: string;
  threadId: string;
  from?: string;
  internalDate?: string;
  labelIds?: string[];
  parentFolderId?: string;
}): ParsedMessage {
  return {
    date: internalDate,
    headers: {
      date: internalDate,
      from,
      subject: `${id} subject`,
      to: "user@example.com",
    },
    historyId: "history-id",
    id,
    inline: [],
    internalDate,
    labelIds,
    parentFolderId,
    snippet: `${id} snippet`,
    subject: `${id} subject`,
    threadId,
  };
}

function getAccount(id: string) {
  return {
    email: `${id}@example.com`,
    id,
    image: null,
    name: id,
  };
}
