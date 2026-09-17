import * as storage from "./local-mail-storage";
import { localMailLedgerBytes } from "./local-mail-storage-ledger";
import {
  installMailCacheStorageTestEnvironment,
  prepareMailCacheLedgerForTest,
} from "./optional-cache-write.test-helpers";
// @vitest-environment jsdom
import "fake-indexeddb/auto";
import type { ParsedMessage } from "@/utils/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearEmailCache,
  clearEmailCacheForAccount,
  getEmailCacheDatabase,
} from "./database";
import { activateMailSync, clearMailActivation } from "./mail-activation";
import {
  initializeSearchIndexAccount,
  seedSearchIndexWork,
} from "./search-index-seed";
import {
  acknowledgeSearchIndexWork,
  readSearchIndexWork,
} from "./search-index-work";
import { writeCachedThreadRows } from "./thread-lists";

vi.mock("./cleanup", () => ({ scheduleEmailCacheCleanup: vi.fn() }));

installMailCacheStorageTestEnvironment();

describe("resumable local index seeding", () => {
  beforeEach(async () => {
    await clearEmailCache();
  });

  afterEach(() => vi.restoreAllMocks());

  it("pauses migration under reserved logical capacity without advancing its cursor, then resumes", async () => {
    activateMailSync("account-1");
    const database = await getTestDatabase();
    await database.put("searchIndexAccounts", {
      emailAccountId: "account-1",
      generation: "migration",
      sourceVersion: 2,
      seed: { store: "threadRows" },
    });
    await database.put("threadRows", {
      emailAccountId: "account-1",
      threadId: "thread",
      fetchedAt: Date.now(),
      lastAccessedAt: Date.now(),
      data: { messages: [getMessage("thread")] },
    });
    await prepareMailCacheLedgerForTest();
    const ledger = (await database.get("localMailStorageLedger", "origin"))!;
    const initialBytes = localMailLedgerBytes(ledger);
    ledger.index.pending = { token: "index-write", reservedGrowthBytes: 1000 };
    await database.put("localMailStorageLedger", ledger);
    const admission = vi
      .spyOn(storage, "readLocalMailStorageAdmission")
      .mockResolvedValue({
        allowed: true,
        reason: "available",
        budgetBytes: initialBytes + 1000,
        backfillLimitBytes: initialBytes + 1000,
        limitBytes: initialBytes + 1000,
        remainingBytes: 1_000_000,
      });
    const before = await database.get("searchIndexAccounts", "account-1");
    expect(await seedSearchIndexWork("account-1")).toMatchObject({
      complete: false,
      retryAfterMs: 60_000,
    });
    expect(await database.get("searchIndexAccounts", "account-1")).toEqual(
      before,
    );
    expect(await database.count("localMailMessages")).toBe(0);
    expect(await database.count("mailboxMessages")).toBe(0);
    expect(await database.count("searchIndexWork")).toBe(0);
    expect(await database.get("localMailStorageLedger", "origin")).toEqual(
      ledger,
    );
    admission.mockResolvedValue({
      allowed: true,
      reason: "available",
      budgetBytes: 1_000_000,
      backfillLimitBytes: 1_000_000,
      limitBytes: 1_000_000,
      remainingBytes: 1_000_000,
    });
    expect(await seedSearchIndexWork("account-1")).toMatchObject({
      complete: false,
    });
    expect(await database.count("localMailMessages")).toBe(1);
    expect(
      (await database.get("searchIndexAccounts", "account-1"))?.seed?.store,
    ).toBe("threadDetails");
    expect((await seedSearchIndexWork("account-1"))?.complete).toBe(true);
  });

  it("does not create an index for assistant-only accounts", async () => {
    expect(await initializeSearchIndexAccount("account-1")).toBeUndefined();
    expect(await seedSearchIndexWork("account-1")).toBeUndefined();
    expect(
      await (await getEmailCacheDatabase())!.count("searchIndexAccounts"),
    ).toBe(0);
  });

  it("reads an initialized account without locking the source stores for writes", async () => {
    activateMailSync("account-1");
    const account = await initializeSearchIndexAccount("account-1");
    const database = await getTestDatabase();
    const transaction = vi.spyOn(database, "transaction");
    expect(await initializeSearchIndexAccount("account-1")).toEqual(account);
    expect(
      transaction.mock.calls.every(([, mode]) => mode !== "readwrite"),
    ).toBe(true);
  });

  it("atomically replaces an obsolete source version when initializers overlap", async () => {
    activateMailSync("account-1");
    const database = await getTestDatabase();
    await database.put("searchIndexAccounts", {
      emailAccountId: "account-1",
      generation: "obsolete-generation",
      sourceVersion: 1,
    });
    const accounts = await Promise.all([
      initializeSearchIndexAccount("account-1"),
      initializeSearchIndexAccount("account-1"),
    ]);
    expect(accounts[0]).toEqual(accounts[1]);
    expect(accounts[0]?.sourceVersion).toBe(2);
    expect(accounts[0]?.generation).not.toBe("obsolete-generation");
  });

  it.each([
    "activation",
    "cleanup",
  ] as const)("rejects an account revoked during its read by %s", async (revocation) => {
    activateMailSync("account-1");
    await initializeSearchIndexAccount("account-1");
    const database = await getTestDatabase();
    const get = database.get.bind(database);
    vi.spyOn(database, "get").mockImplementationOnce(async (...args) => {
      const account = await get(...args);
      if (revocation === "activation") clearMailActivation("account-1");
      else {
        await clearEmailCacheForAccount("account-1");
        activateMailSync("account-1");
      }
      return account;
    });
    expect(await initializeSearchIndexAccount("account-1")).toBeUndefined();
  });

  it("resumes bounded seeding and catches new rows behind its cursor", async () => {
    await writeCachedThreadRows({
      emailAccountId: "account-1",
      threads: Array.from({ length: 125 }, (_, i) => ({
        id: `thread-${String(i).padStart(3, "0")}`,
        messages: [getMessage(`thread-${String(i).padStart(3, "0")}`)],
      })),
    });
    activateMailSync("account-1");
    const account = (await initializeSearchIndexAccount("account-1"))!;
    expect((await initializeSearchIndexAccount("account-1"))?.generation).toBe(
      account.generation,
    );
    await seedSearchIndexWork("account-1"); // Empty mailbox store.
    expect(await seedSearchIndexWork("account-1")).toEqual({
      generation: account.generation,
      complete: false,
    });
    const batch = (await readSearchIndexWork("account-1"))!;
    expect(batch.work).toHaveLength(100);
    await acknowledgeSearchIndexWork({ emailAccountId: "account-1", ...batch });
    await writeCachedThreadRows({
      emailAccountId: "account-1",
      fetchedAt: Date.now(),
      threads: [
        { id: "thread-000-new", messages: [getMessage("thread-000-new")] },
      ],
    });
    await seedSearchIndexWork("account-1");
    expect(await seedSearchIndexWork("account-1")).toEqual({
      generation: account.generation,
      complete: true,
    });
    const remaining = (await readSearchIndexWork("account-1"))!.work;
    expect(remaining).toHaveLength(26);
    expect(remaining.map((item) => item.threadId)).toContain("thread-000-new");
    const database = (await getEmailCacheDatabase())!;
    const rows = await database.getAllFromIndex(
      "localMailMessages",
      "byAccount",
      "account-1",
    );
    expect(
      (await database.get("searchIndexAccounts", "account-1"))?.messageBytes,
    ).toBe(rows.reduce((total, row) => total + row.byteSize, 0));
  });

  it("resumes inside a conversation without exceeding one message batch", async () => {
    const messages = Array.from({ length: 150 }, (_, index) => ({
      ...getMessage("large-thread"),
      id: `message-${index}`,
    }));
    await writeCachedThreadRows({
      emailAccountId: "account-1",
      threads: [{ id: "large-thread", messages }],
    });
    activateMailSync("account-1");
    await initializeSearchIndexAccount("account-1");
    await seedSearchIndexWork("account-1");
    await seedSearchIndexWork("account-1");
    const database = (await getEmailCacheDatabase())!;
    expect(await database.count("localMailMessages")).toBe(100);
    await seedSearchIndexWork("account-1");
    expect(await database.count("localMailMessages")).toBe(150);
    expect((await seedSearchIndexWork("account-1"))?.complete).toBe(true);
  });

  it("revokes seeding on cleanup and creates a new generation on reactivation", async () => {
    activateMailSync("account-1");
    const old = (await initializeSearchIndexAccount("account-1"))!;
    await clearEmailCacheForAccount("account-1");
    expect(await seedSearchIndexWork("account-1")).toBeUndefined();
    activateMailSync("account-1");
    expect(
      (await initializeSearchIndexAccount("account-1"))?.generation,
    ).not.toBe(old.generation);
  });
});

function getMessage(threadId: string): ParsedMessage {
  return {
    id: `message-${threadId}`,
    threadId,
    headers: {
      date: "2026-01-01",
      from: "sender@example.com",
      to: "user@example.com",
      subject: "Example",
    },
    date: "2026-01-01",
    internalDate: "1767225600000",
    historyId: "1",
    inline: [],
    labelIds: ["INBOX"],
    subject: "Example",
    snippet: "Example",
  };
}

async function getTestDatabase() {
  const database = await getEmailCacheDatabase();
  if (!database) throw new Error("Email cache unavailable in test");
  return database;
}
