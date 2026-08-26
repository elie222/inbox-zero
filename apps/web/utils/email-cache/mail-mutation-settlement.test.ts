// @vitest-environment jsdom

import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearEmailCache, getEmailCacheDatabase } from "./database";
import { subscribeToMailboxStore } from "./mailbox";
import { settleMailMutationInCache } from "./mail-mutation-settlement";
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
});

function mutation(messageId: string): MailMutation {
  return {
    id: "mutation",
    batchId: "mutation",
    emailAccountId: "account-1",
    threadId: "shared",
    messageIds: [messageId],
    kind: "archive",
    status: "processing",
    attempts: 1,
    nextAttemptAt: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}
