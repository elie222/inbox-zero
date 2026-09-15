// @vitest-environment jsdom

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearEmailCache, getEmailCacheDatabase } from "./database";
import { subscribeToMailboxStore } from "./mailbox";
import {
  settleMailMutationBatchInCache,
  settleMailMutationInCache,
} from "./mail-mutation-settlement";
import type { MailMutation } from "./mail-mutations";

describe("mail mutation cache settlement", () => {
  beforeEach(clearEmailCache);

  it("persists star toggles without removing the thread or its unread state", async () => {
    const database = await getEmailCacheDatabase();
    await database?.put("threadRows", {
      emailAccountId: "account-1",
      threadId: "shared",
      data: {
        messages: [
          { id: "old", labelIds: ["INBOX", "UNREAD"] },
          { id: "new", labelIds: ["INBOX"] },
        ],
      },
      fetchedAt: 1,
      lastAccessedAt: 1,
    });
    for (const starred of [true, false]) {
      await settleMailMutationInCache({
        ...mutation("old"),
        kind: "set_starred_state",
        starred,
      });
      await expect(
        database?.get("threadRows", ["account-1", "shared"]),
      ).resolves.toMatchObject({
        data: {
          messages: [
            {
              id: "old",
              labelIds: starred
                ? ["INBOX", "UNREAD", "STARRED"]
                : ["INBOX", "UNREAD"],
            },
            { id: "new", labelIds: ["INBOX"] },
          ],
        },
      });
    }
  });

  it("keeps archived messages with INBOX removed instead of deleting them", async () => {
    const database = await seedCachedThread({
      messages: [
        { id: "old", labelIds: ["INBOX", "UNREAD"] },
        { id: "new", labelIds: ["INBOX"] },
      ],
    });

    await settleMailMutationInCache(mutation("old"));

    await expect(
      database?.get("mailboxMessages", ["account-1", "old"]),
    ).resolves.toMatchObject({
      data: { labelIds: ["UNREAD"] },
    });
    await expect(
      database?.get("threadRows", ["account-1", "shared"]),
    ).resolves.toMatchObject({
      data: {
        messages: [
          { id: "old", labelIds: ["UNREAD"] },
          { id: "new", labelIds: ["INBOX"] },
        ],
      },
    });
    await expect(
      database?.get("threadDetails", [
        "account-1",
        "shared",
        "drafts:0|replies:0",
      ]),
    ).resolves.toMatchObject({
      data: {
        thread: {
          messages: [
            { id: "old", labelIds: ["UNREAD"] },
            { id: "new", labelIds: ["INBOX"] },
          ],
        },
      },
    });
    await expect(
      database?.get("threadViews", ["account-1", "inbox"]),
    ).resolves.toMatchObject({ threadIds: ["shared"] });
  });

  it("restores INBOX when unarchiving a cached message", async () => {
    const database = await seedCachedThread({
      messages: [{ id: "old", labelIds: ["UNREAD"] }],
    });

    await settleMailMutationInCache({
      ...mutation("old"),
      kind: "unarchive",
    });

    await expect(
      database?.get("mailboxMessages", ["account-1", "old"]),
    ).resolves.toMatchObject({
      data: { labelIds: ["UNREAD", "INBOX"] },
    });
    await expect(
      database?.get("threadRows", ["account-1", "shared"]),
    ).resolves.toMatchObject({
      data: { messages: [{ id: "old", labelIds: ["UNREAD", "INBOX"] }] },
    });
    await expect(
      database?.get("threadDetails", [
        "account-1",
        "shared",
        "drafts:0|replies:0",
      ]),
    ).resolves.toMatchObject({
      data: {
        thread: {
          messages: [{ id: "old", labelIds: ["UNREAD", "INBOX"] }],
        },
      },
    });
  });

  it("updates only the owning account's cached rows", async () => {
    const database = await getEmailCacheDatabase();
    for (const emailAccountId of ["account-1", "account-2"]) {
      await database?.put("threadRows", {
        emailAccountId,
        threadId: "shared",
        data: {
          id: "shared",
          messages: [{ id: `${emailAccountId}-message`, labelIds: ["INBOX"] }],
        },
        fetchedAt: 1,
        lastAccessedAt: 1,
      });
    }
    await settleMailMutationInCache(mutation("account-1-message"));

    await expect(
      database?.get("threadRows", ["account-1", "shared"]),
    ).resolves.toMatchObject({
      data: { messages: [{ id: "account-1-message", labelIds: [] }] },
    });
    await expect(
      database?.get("threadRows", ["account-2", "shared"]),
    ).resolves.toMatchObject({
      data: { messages: [{ id: "account-2-message", labelIds: ["INBOX"] }] },
    });
  });

  it("scopes legacy composite rows to their owning account", async () => {
    const database = await getEmailCacheDatabase();
    for (const emailAccountId of ["account-1", "account-2"]) {
      await database?.put("threadRows", {
        emailAccountId,
        threadId: "account-1:shared",
        data: {
          id: "shared",
          messages: [{ id: "account-1-message", labelIds: ["INBOX"] }],
        },
        fetchedAt: 1,
        lastAccessedAt: 1,
      });
    }

    await settleMailMutationInCache(mutation("account-1-message"));

    await expect(
      database?.get("threadRows", ["account-1", "account-1:shared"]),
    ).resolves.toMatchObject({
      data: { messages: [{ id: "account-1-message", labelIds: [] }] },
    });
    await expect(
      database?.get("threadRows", ["account-2", "account-1:shared"]),
    ).resolves.toMatchObject({
      data: { messages: [{ id: "account-1-message", labelIds: ["INBOX"] }] },
    });
  });

  it("keeps read-state mutations in cached thread views", async () => {
    const database = await getEmailCacheDatabase();
    await database?.put("threadRows", {
      emailAccountId: "account-1",
      threadId: "shared",
      data: {
        id: "shared",
        messages: [{ id: "old", labelIds: ["INBOX", "UNREAD"] }],
      },
      fetchedAt: 1,
      lastAccessedAt: 1,
    });
    await database?.put("threadViews", {
      emailAccountId: "account-1",
      viewKey: "inbox",
      threadIds: ["shared"],
      hasMore: false,
      fetchedAt: 1,
      lastAccessedAt: 1,
    });

    await settleMailMutationInCache({
      ...mutation("old"),
      kind: "set_read_state",
      read: true,
    });

    await expect(
      database?.get("threadViews", ["account-1", "inbox"]),
    ).resolves.toMatchObject({ threadIds: ["shared"] });
    await expect(
      database?.get("threadRows", ["account-1", "shared"]),
    ).resolves.toMatchObject({
      data: { messages: [{ id: "old", labelIds: ["INBOX"] }] },
    });
  });

  it("notifies the live mailbox after settling cached state", async () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToMailboxStore(listener);

    try {
      await settleMailMutationInCache(mutation("old"));
      expect(listener).toHaveBeenCalledExactlyOnceWith("account-1");
    } finally {
      unsubscribe();
    }
  });

  it("settles a large archive batch by rewriting labels in one pass", async () => {
    const database = await getEmailCacheDatabase();
    for (const threadId of ["first", "second", "untouched"]) {
      await database?.put("threadRows", {
        emailAccountId: "account-1",
        threadId,
        data: {
          id: threadId,
          messages: [{ id: `${threadId}-message`, labelIds: ["INBOX"] }],
        },
        fetchedAt: 1,
        lastAccessedAt: 1,
      });
    }
    await database?.put("threadViews", {
      emailAccountId: "account-1",
      viewKey: "inbox",
      threadIds: ["first", "second", "untouched"],
      hasMore: false,
      fetchedAt: 1,
      lastAccessedAt: 1,
    });

    await settleMailMutationBatchInCache([
      mutation("first-message", "first"),
      mutation("second-message", "second"),
    ]);

    await expect(
      database?.get("threadRows", ["account-1", "first"]),
    ).resolves.toMatchObject({
      data: { messages: [{ id: "first-message", labelIds: [] }] },
    });
    await expect(
      database?.get("threadRows", ["account-1", "second"]),
    ).resolves.toMatchObject({
      data: { messages: [{ id: "second-message", labelIds: [] }] },
    });
    await expect(
      database?.get("threadRows", ["account-1", "untouched"]),
    ).resolves.toMatchObject({
      data: { messages: [{ id: "untouched-message", labelIds: ["INBOX"] }] },
    });
    await expect(
      database?.get("threadViews", ["account-1", "inbox"]),
    ).resolves.toMatchObject({
      threadIds: ["first", "second", "untouched"],
    });
  });
});

function mutation(messageId: string, threadId = "shared"): MailMutation {
  return {
    id: "mutation",
    batchId: "mutation",
    emailAccountId: "account-1",
    threadId,
    messageIds: [messageId],
    kind: "archive",
    status: "processing",
    attempts: 1,
    nextAttemptAt: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

async function seedCachedThread({
  messages,
}: {
  messages: Array<{ id: string; labelIds: string[] }>;
}) {
  const database = await getEmailCacheDatabase();
  for (const message of messages) {
    await database?.put("mailboxMessages", {
      emailAccountId: "account-1",
      messageId: message.id,
      threadId: "shared",
      data: {
        id: message.id,
        threadId: "shared",
        labelIds: message.labelIds,
        headers: { from: "sender@example.com" },
      },
      receivedAt: 1,
      lastAccessedAt: 1,
    });
  }
  await database?.put("threadRows", {
    emailAccountId: "account-1",
    threadId: "shared",
    data: { id: "shared", messages },
    fetchedAt: 1,
    lastAccessedAt: 1,
  });
  await database?.put("threadDetails", {
    emailAccountId: "account-1",
    threadId: "shared",
    variant: "drafts:0|replies:0",
    data: { thread: { id: "shared", messages } },
    fetchedAt: 1,
    lastAccessedAt: 1,
    byteSize: 100,
  });
  await database?.put("threadViews", {
    emailAccountId: "account-1",
    viewKey: "inbox",
    threadIds: ["shared"],
    hasMore: false,
    fetchedAt: 1,
    lastAccessedAt: 1,
  });
  return database;
}
