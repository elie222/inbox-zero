import { getMockParsedMessage } from "@/__tests__/mocks/email-provider.mock";
import { writeCachedThreadDetail } from "./threads";
import { writeCachedThreadList, writeCachedThreadRows } from "./thread-lists";
import { applyMailboxSyncPage, markSyncedMailboxThreadsRead } from "./mailbox";
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearEmailCache, getEmailCacheDatabase } from "./database";
import { withOptionalMailCacheWrite } from "./optional-cache-write";
import {
  installMailCacheStorageTestEnvironment,
  prepareMailCacheLedgerForTest,
} from "./optional-cache-write.test-helpers";
import { readLocalMailSettings } from "./local-mail-settings";
import { localMailLedgerBytes } from "./local-mail-storage-ledger";

vi.mock("./local-mail-settings", async (original) => ({
  ...(await original<typeof import("./local-mail-settings")>()),
  readLocalMailSettings: vi.fn(),
}));
installMailCacheStorageTestEnvironment();
beforeEach(async () => {
  await clearEmailCache();
  await prepareMailCacheLedgerForTest();
  await admit(100_000);
});

describe("optional cache write budget", () => {
  it("preserves queued write/read order and snapshots input values", async () => {
    const db = (await getEmailCacheDatabase())!;
    await withOptionalMailCacheWrite(db, ["threadRows"], async (tx) => {
      const store = tx.objectStore("threadRows");
      const row = message("a", "original");
      const write = store.put(row);
      row.data.body = "changed after invocation";
      const read = store.get(["account", "a"]);
      const count = store.index("byAccount").count("account");
      await write;
      expect((await read)?.data).toEqual({ body: "original" });
      expect(await count).toBe(1);
    });
  });

  it("preserves cursor mutation before an immediately queued advance", async () => {
    const db = (await getEmailCacheDatabase())!;
    await withOptionalMailCacheWrite(db, ["threadRows"], async (tx) => {
      const store = tx.objectStore("threadRows");
      await Promise.all([
        store.put(message("a", "old")),
        store.put(message("b", "old")),
      ]);
      let cursor = (await store.openCursor())!;
      const update = cursor.update(message("a", "updated"));
      const next = cursor.continue();
      await update;
      cursor = (await next)!;
      const deletion = cursor.delete();
      const end = cursor.continue();
      await deletion;
      expect(await end).toBeNull();
      expect((await store.get(["account", "a"]))?.data).toEqual({
        body: "updated",
      });
      expect(await store.get(["account", "b"])).toBeUndefined();
    });
  });

  it("aborts all representations and the cursor when the final write exceeds allowance", async () => {
    const db = (await getEmailCacheDatabase())!;
    const row = message("a", "small");
    const state = {
      emailAccountId: "account",
      cursor: "new",
      after: "2026-01-01",
      hasMore: false,
      lastSyncedAt: 1,
    };
    await admit(bytes(row) + bytes(state));
    await withOptionalMailCacheWrite(
      db,
      ["threadRows", "mailboxSyncStates", "threadDetails"],
      async (tx) => {
        await tx.objectStore("threadRows").put(row);
        await tx.objectStore("mailboxSyncStates").put(state);
        await tx.objectStore("threadDetails").put({
          emailAccountId: "account",
          threadId: "a",
          variant: "full",
          data: { body: "oversized" },
          byteSize: 100,
          fetchedAt: 1,
          lastAccessedAt: 1,
        });
        await tx.done;
      },
    );
    expect(await db.count("threadRows")).toBe(0);
    expect(await db.count("mailboxSyncStates")).toBe(0);
    expect(await db.count("threadDetails")).toBe(0);
  });

  it.each([
    "detail",
    "list",
    "rows",
    "mailbox",
  ] as const)("atomically rejects %s cache growth including delegated canonical and projection bytes", async (kind) => {
    const db = (await getEmailCacheDatabase())!;
    const account = { emailAccountId: "account", generation: "generation" };
    await db.put("searchIndexAccounts", account);
    const payload = getMockParsedMessage({
      id: "message",
      threadId: "thread",
      textPlain: "body".repeat(100),
      internalDate: "1000",
    });
    const write = async () => {
      const common = { emailAccountId: "account", now: 1000 };
      if (kind === "detail")
        return writeCachedThreadDetail({
          ...common,
          threadId: "thread",
          variant: "drafts:0|replies:0",
          data: {
            thread: { id: "thread", historyId: "1", messages: [payload] },
          },
        });
      if (kind === "list")
        return writeCachedThreadList({
          ...common,
          viewKey: "inbox",
          hasMore: false,
          threads: [{ id: "thread", messages: [payload] }],
        });
      if (kind === "rows")
        return writeCachedThreadRows({
          ...common,
          fetchedAt: 1000,
          threads: [{ id: "thread", messages: [payload] }],
        });
      return applyMailboxSyncPage({
        ...common,
        after: new Date(0),
        page: {
          cursor: "next",
          reset: true,
          hasMore: false,
          deletedMessageIds: [],
          upsertedMessages: [payload],
        },
      });
    };
    await write();
    const stores = [
      "threadDetails",
      "threadRows",
      "threadViews",
      "localMailMessages",
      "mailboxMessages",
      "mailboxSyncStates",
      "searchIndexWork",
      "searchIndexAccounts",
    ] as const;
    let total = -bytes(account);
    for (const store of stores)
      for (const record of await db.getAll(store)) total += bytes(record);
    expect(total).toBeGreaterThan(bytes(payload));
    await clearEmailCache();
    await prepareMailCacheLedgerForTest();
    await db.put("searchIndexAccounts", account);
    await admit(total - 1);
    await write();
    for (const store of stores.filter((name) => name !== "searchIndexAccounts"))
      expect(await db.count(store)).toBe(0);
    expect(await db.get("searchIndexAccounts", "account")).toEqual(account);
  });

  it("does not block settlement of user read state at storage pressure", async () => {
    const db = (await getEmailCacheDatabase())!;
    await db.put("searchIndexAccounts", {
      emailAccountId: "account",
      generation: "generation",
    });
    const payload = getMockParsedMessage({
      id: "message",
      threadId: "thread",
      labelIds: ["INBOX", "UNREAD"],
    });
    await applyMailboxSyncPage({
      emailAccountId: "account",
      after: new Date(0),
      page: {
        cursor: "next",
        reset: true,
        hasMore: false,
        deletedMessageIds: [],
        upsertedMessages: [payload],
      },
    });
    await admit(0);
    await markSyncedMailboxThreadsRead({
      emailAccountId: "account",
      threadIds: ["thread"],
      read: true,
    });
    expect(
      (await db.get("localMailMessages", ["account", "message"]))?.data
        .labelIds,
    ).not.toContain("UNREAD");
  });

  it("charges replacement deltas and serializes repeated writes to the same record", async () => {
    const db = (await getEmailCacheDatabase())!;
    const before = message("a", "large body".repeat(100));
    await db.put("threadRows", before);
    const after = message("a", "small");
    await admit(0);
    await withOptionalMailCacheWrite(db, ["threadRows"], async (tx) => {
      await Promise.all([
        tx.objectStore("threadRows").put(after),
        tx.objectStore("threadRows").put(after),
      ]);
      await tx.done;
    });
    expect(await db.get("threadRows", ["account", "a"])).toEqual(after);
  });

  it("measures cursor updates and rolls back earlier cursor deletions on growth rejection", async () => {
    const db = (await getEmailCacheDatabase())!;
    // Seeded through the meter so the ledger counts them; raw writes would make
    // the later deletion underflow the counter and force a recount.
    await withOptionalMailCacheWrite(db, ["threadRows"], async (tx) => {
      await tx.objectStore("threadRows").put(message("a", "small"));
      await tx.objectStore("threadRows").put(message("b", "small"));
      await tx.done;
    });
    await admit(0);
    await withOptionalMailCacheWrite(db, ["threadRows"], async (tx) => {
      let cursor = await tx
        .objectStore("threadRows")
        .index("byAccount")
        .openCursor("account");
      await cursor!.delete();
      cursor = await cursor!.continue();
      await cursor!.update(message("b", "large".repeat(1000)));
      await tx.done;
    });
    expect(await db.count("threadRows")).toBe(2);
    expect((await db.get("threadRows", ["account", "b"]))?.data).toEqual({
      body: "small",
    });
  });

  it("permits range deletion and shrinking writes at the budget limit", async () => {
    const db = (await getEmailCacheDatabase())!;
    await db.put("threadRows", message("a", "large".repeat(100)));
    await db.put("threadRows", message("b", "large".repeat(100)));
    await admit(0);
    await withOptionalMailCacheWrite(db, ["threadRows"], async (tx) => {
      await tx
        .objectStore("threadRows")
        .delete(
          IDBKeyRange.bound(["account", "a"], ["account", "b"], false, true),
        );
      await tx.objectStore("threadRows").put(message("b", "small"));
      await tx.done;
    });
    expect(await db.count("threadRows")).toBe(1);
    expect((await db.get("threadRows", ["account", "b"]))?.data).toEqual({
      body: "small",
    });
  });

  it("caches mail while other site storage is large and the mail budget has room", async () => {
    const db = (await getEmailCacheDatabase())!;
    // The offline app bundle and other site caches share this origin, so origin
    // usage says nothing about how much of the mail budget is spent.
    vi.stubGlobal("navigator", {
      ...globalThis.navigator,
      storage: {
        estimate: async () => ({
          usage: 480 * 1024 * 1024,
          quota: 10 * 1024 ** 3,
        }),
      },
    });
    await withOptionalMailCacheWrite(db, ["threadRows"], async (tx) => {
      await tx.objectStore("threadRows").put(message("a", "body"));
      await tx.done;
    });
    expect(await db.count("threadRows")).toBe(1);
  });

  it("caches mail without Web Locks", async () => {
    const db = (await getEmailCacheDatabase())!;
    vi.stubGlobal("navigator", { storage: navigator.storage });
    await withOptionalMailCacheWrite(db, ["threadRows"], async (tx) => {
      await tx.objectStore("threadRows").put(message("a", "new"));
      await tx.done;
    });
    expect(await db.count("threadRows")).toBe(1);
  });
});
// Allows exactly `remainingBytes` of further growth on top of what is stored.
async function admit(remainingBytes: number) {
  const db = (await getEmailCacheDatabase())!;
  const ledger = await db.get("localMailStorageLedger", "origin");
  const usedBytes = ledger ? localMailLedgerBytes(ledger) : 0;
  vi.mocked(readLocalMailSettings).mockReturnValue({
    budgetBytes: usedBytes + remainingBytes,
    attachmentBudgetBytes: 0,
    backfillEnabled: true,
    pushEnabled: true,
  });
}
function message(threadId: string, body: string) {
  return {
    emailAccountId: "account",
    threadId,
    data: { body },
    fetchedAt: 1,
    lastAccessedAt: 1,
  };
}
function bytes(record: unknown) {
  return new Blob([JSON.stringify(record)]).size;
}
