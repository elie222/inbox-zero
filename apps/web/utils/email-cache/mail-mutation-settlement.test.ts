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

  it("removes only the owning raw row and matching composite rows", async () => {
    const database = await getEmailCacheDatabase();
    for (const emailAccountId of ["account-1", "account-2"]) {
      await database?.put("threadRows", {
        emailAccountId,
        threadId: "shared",
        data: { id: "shared", messages: [{ id: `${emailAccountId}-message` }] },
        fetchedAt: 1,
        lastAccessedAt: 1,
      });
      await database?.put("threadViews", {
        emailAccountId,
        viewKey: "inbox",
        threadIds: ["shared"],
        hasMore: false,
        fetchedAt: 1,
        lastAccessedAt: 1,
      });
    }
    await settleMailMutationInCache(mutation("account-1-message"));

    await expect(
      database?.get("threadRows", ["account-1", "shared"]),
    ).resolves.toBeUndefined();
    await expect(
      database?.get("threadRows", ["account-2", "shared"]),
    ).resolves.toBeDefined();
    await expect(
      database?.get("threadViews", ["account-2", "inbox"]),
    ).resolves.toMatchObject({ threadIds: ["shared"] });
  });

  it("scopes legacy composite rows to their owning account", async () => {
    const database = await getEmailCacheDatabase();
    for (const emailAccountId of ["account-1", "account-2"]) {
      await database?.put("threadRows", {
        emailAccountId,
        threadId: "account-1:shared",
        data: {
          id: "shared",
          messages: [{ id: "account-1-message" }],
        },
        fetchedAt: 1,
        lastAccessedAt: 1,
      });
    }

    await settleMailMutationInCache(mutation("account-1-message"));

    await expect(
      database?.get("threadRows", ["account-1", "account-1:shared"]),
    ).resolves.toBeUndefined();
    await expect(
      database?.get("threadRows", ["account-2", "account-1:shared"]),
    ).resolves.toBeDefined();
  });

  it("preserves a new untargeted message in the same cached thread", async () => {
    const database = await getEmailCacheDatabase();
    await database?.put("threadRows", {
      emailAccountId: "account-1",
      threadId: "shared",
      data: { id: "shared", messages: [{ id: "old" }, { id: "new" }] },
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

    await settleMailMutationInCache(mutation("old"));

    await expect(
      database?.get("threadRows", ["account-1", "shared"]),
    ).resolves.toMatchObject({ data: { messages: [{ id: "new" }] } });
    await expect(
      database?.get("threadViews", ["account-1", "inbox"]),
    ).resolves.toMatchObject({ threadIds: ["shared"] });
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

  it("settles a large archive batch in one cached-state pass", async () => {
    const database = await getEmailCacheDatabase();
    for (const threadId of ["first", "second", "untouched"]) {
      await database?.put("threadRows", {
        emailAccountId: "account-1",
        threadId,
        data: {
          id: threadId,
          messages: [{ id: `${threadId}-message` }],
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
    ).resolves.toBeUndefined();
    await expect(
      database?.get("threadRows", ["account-1", "second"]),
    ).resolves.toBeUndefined();
    await expect(
      database?.get("threadRows", ["account-1", "untouched"]),
    ).resolves.toBeDefined();
    await expect(
      database?.get("threadViews", ["account-1", "inbox"]),
    ).resolves.toMatchObject({ threadIds: ["untouched"] });
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
