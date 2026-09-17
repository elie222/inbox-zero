import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearEmailCache, getEmailCacheDatabase } from "./database";
import {
  storeLocalMailMessages,
  deleteLocalMailMessages,
  evictLocalMailMessage,
} from "./local-mail-messages";
import {
  readLocalMailThreadPage,
  keepLocalMailThreadOpen,
} from "./local-mail-reader";

const scope = { emailAccountId: "account-1", threadId: "thread-1" };

describe("canonical conversation reading", () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(async () => {
    await clearEmailCache();
    const database = await getDatabase();
    await database.put("searchIndexAccounts", {
      emailAccountId: scope.emailAccountId,
      generation: "generation-1",
    });
  });

  it("protects an open thread from eviction and expires protection after closing", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    vi.setSystemTime(1_000_000);
    await store("message", "body");
    const database = await getDatabase();
    const account = (await database.get(
      "searchIndexAccounts",
      scope.emailAccountId,
    ))!;
    await database.put("searchIndexAccounts", {
      ...account,
      retentionRevision: 1,
    });
    await database.put("localMailRetentionPolicies", {
      emailAccountId: scope.emailAccountId,
      generation: account.generation,
      revision: 1,
      requestedAfter: 0,
      automaticAfter: 0,
    });
    await readLocalMailThreadPage({ ...scope, protectWhileOpen: true });
    const initialProtection = await database.get("localMailThreadProtection", [
      scope.emailAccountId,
      scope.threadId,
    ]);
    await vi.advanceTimersByTimeAsync(1000);
    await readLocalMailThreadPage({ ...scope, protectWhileOpen: true });
    expect(
      await database.get("localMailThreadProtection", [
        scope.emailAccountId,
        scope.threadId,
      ]),
    ).toEqual(initialProtection);
    expect(await evictOpenedMessage()).toBe(false);
    const close = keepLocalMailThreadOpen({
      ...scope,
      generation: account.generation,
    });
    await vi.advanceTimersByTimeAsync(6 * 60_000);
    await vi.waitFor(async () => {
      expect(
        (
          await database.get("localMailThreadProtection", [
            scope.emailAccountId,
            scope.threadId,
          ])
        )?.recentlyOpenedUntil,
      ).toBeGreaterThan(Date.now());
    });
    expect(await evictOpenedMessage()).toBe(false);
    close();
    await vi.advanceTimersByTimeAsync(5 * 60_000 + 1);
    expect(await evictOpenedMessage()).toBe(true);
    expect(await database.count("localMailMessages")).toBe(0);
  });

  it("does not protect ordinary reads or renew a replacement account generation", async () => {
    vi.useFakeTimers({ toFake: ["Date", "setInterval", "clearInterval"] });
    await store("message", "body");
    const database = await getDatabase();
    await readLocalMailThreadPage(scope);
    expect(await database.count("localMailThreadProtection")).toBe(0);
    const close = keepLocalMailThreadOpen({
      ...scope,
      generation: "generation-1",
    });
    await database.put("searchIndexAccounts", {
      emailAccountId: scope.emailAccountId,
      generation: "replacement",
    });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(await database.count("localMailThreadProtection")).toBe(0);
    close();
  });

  it("reads retained bodies without a display cache and distinguishes missing bodies", async () => {
    await store("body", "retained content");
    await store("metadata");
    const result = await readLocalMailThreadPage(scope);
    expect(
      result?.messages.map(({ message, bodyAvailable }) => [
        message.id,
        bodyAvailable,
      ]),
    ).toEqual([
      ["body", true],
      ["metadata", false],
    ]);
    expect(result?.messages[0].message.textPlain).toBe("retained content");
    expect(await (await getDatabase()).count("threadDetails")).toBe(0);
    expect(
      await readLocalMailThreadPage({ ...scope, emailAccountId: "account-2" }),
    ).toBeUndefined();
  });

  it("paginates through filtered drafts without hiding later messages", async () => {
    for (let i = 0; i < 101; i++)
      await store(`z-${String(i).padStart(3, "0")}`, undefined, ["DRAFT"]);
    await store("a-message", "body");
    const first = await readLocalMailThreadPage(scope);
    expect(first?.messages).toEqual([]);
    expect(first?.next?.messageId).toBe("z-001");
    const second = await readLocalMailThreadPage({
      ...scope,
      before: first?.next,
      generation: first?.generation,
    });
    expect(second?.messages.map(({ message }) => message.id)).toEqual([
      "a-message",
    ]);
    expect(second?.next).toBeUndefined();
    const withDrafts = await readLocalMailThreadPage({
      ...scope,
      includeDrafts: true,
    });
    expect(withDrafts?.messages).toHaveLength(30);
  });

  it("overrides stale display snapshots after the last retained message is evicted", async () => {
    const database = await getDatabase();
    await database.put("localMailEvictedMessages", {
      ...scope,
      messageId: "evicted",
      receivedAt: 1,
      evictedAt: 2,
      revision: 1,
      byteSize: 100,
    });
    expect(await readLocalMailThreadPage(scope)).toMatchObject({
      messages: [],
      hasRetainedThread: true,
    });
    expect(
      await readLocalMailThreadPage({ ...scope, threadId: "other" }),
    ).toMatchObject({ hasRetainedThread: false });
  });

  it("orders by message date rather than provider identifier", async () => {
    await store("a-newer", "newer");
    await store("z-older", "older");
    const database = await getDatabase();
    const older = await database.get("localMailMessages", [
      scope.emailAccountId,
      "z-older",
    ]);
    if (!older) throw new Error("Missing fixture");
    await database.put("localMailMessages", {
      ...older,
      receivedAt: older.receivedAt - 1,
    });
    const page = await readLocalMailThreadPage(scope);
    expect(page?.messages.map(({ message }) => message.id)).toEqual([
      "z-older",
      "a-newer",
    ]);
  });

  it("opens the most recent page and continues toward older messages", async () => {
    for (let index = 0; index < 31; index++)
      await store(String(index).padStart(2, "0"), "body");
    const latest = await readLocalMailThreadPage(scope);
    expect(latest?.messages).toHaveLength(30);
    expect(latest?.messages[0].message.id).toBe("01");
    expect(latest?.messages.at(-1)?.message.id).toBe("30");
    const older = await readLocalMailThreadPage({
      ...scope,
      before: latest?.next,
      generation: latest?.generation,
    });
    expect(older?.messages.map(({ message }) => message.id)).toEqual(["00"]);
  });

  it("keeps deleted thread identity so a stale display snapshot is not resurrected", async () => {
    await store("message", "body");
    const database = await getDatabase();
    const transaction = database.transaction(
      [
        "localMailMessages",
        "localMailTombstones",
        "searchIndexAccounts",
        "searchIndexWork",

        "localMailAttachmentFiles",
        "localMailAttachmentJobs",
        "localMailThreadProtection",
      ],
      "readwrite",
    );
    await deleteLocalMailMessages(
      transaction,
      scope.emailAccountId,
      ["message"],
      200,
    );
    await transaction.done;
    const page = await readLocalMailThreadPage(scope);
    expect(page?.messages).toEqual([]);
    expect(page?.hasRetainedThread).toBe(true);
    expect(
      (await readLocalMailThreadPage({ ...scope, threadId: "unknown" }))
        ?.hasRetainedThread,
    ).toBe(false);
  });

  it("associates a deletion with a thread when a stale response arrives later", async () => {
    const database = await getDatabase();
    await database.put("localMailTombstones", {
      emailAccountId: scope.emailAccountId,
      messageId: "message",
      deletedAt: 200,
    });
    await store("message", "stale body");
    const page = await readLocalMailThreadPage(scope);
    expect(page?.messages).toEqual([]);
    expect(page?.hasRetainedThread).toBe(true);
  });

  it("discards a page when the source generation changes while reading", async () => {
    await store("message", "body");
    const database = await getDatabase();
    const pending = readLocalMailThreadPage(scope);
    await Promise.resolve();
    await database.put("searchIndexAccounts", {
      emailAccountId: scope.emailAccountId,
      generation: "replacement",
    });
    expect(await pending).toBeUndefined();
  });

  it("discards an in-flight read when the cache is cleared", async () => {
    await store("message", "body");
    const pending = readLocalMailThreadPage(scope);
    await clearEmailCache();
    expect(await pending).toBeUndefined();
  });

  it("rejects continuation after account replacement", async () => {
    await store("message", "body");
    expect(
      await readLocalMailThreadPage({ ...scope, generation: "old-generation" }),
    ).toBeUndefined();
    await (await getDatabase()).delete(
      "searchIndexAccounts",
      scope.emailAccountId,
    );
    expect(await readLocalMailThreadPage(scope)).toBeUndefined();
  });

  it("bounds pages by bytes while allowing progress past one oversized body", async () => {
    await store("z-large", "x".repeat(4 * 1024 * 1024));
    await store("a-small", "body");
    const first = await readLocalMailThreadPage(scope);
    expect(first?.messages).toHaveLength(1);
    expect(first?.next?.messageId).toBe("z-large");
    const second = await readLocalMailThreadPage({
      ...scope,
      before: first?.next,
    });
    expect(second?.messages[0].message.id).toBe("a-small");
  });
});

async function getDatabase() {
  const database = await getEmailCacheDatabase();
  if (!database) throw new Error("Database unavailable");
  return database;
}

async function store(id: string, textPlain?: string, labelIds: string[] = []) {
  const database = await getDatabase();
  const transaction = database.transaction(
    [
      "localMailMessages",
      "localMailTombstones",
      "searchIndexAccounts",
      "searchIndexWork",

      "localMailAttachmentFiles",
      "localMailAttachmentJobs",
      "localMailThreadProtection",
    ],
    "readwrite",
  );
  await storeLocalMailMessages(
    transaction,
    scope.emailAccountId,
    [
      {
        id,
        threadId: scope.threadId,
        headers: {
          from: "sender@example.com",
          to: "recipient@example.com",
          subject: "Subject",
          date: "2026-01-01",
        },
        subject: "Subject",
        snippet: "",
        textPlain,
        labelIds,
      },
    ],
    100,
  );
  await transaction.done;
}

async function evictOpenedMessage() {
  const database = await getDatabase();
  const transaction = database.transaction(
    [
      "searchIndexAccounts",
      "searchIndexWork",
      "localMailMessages",
      "localMailRetentionPolicies",
      "localMailThreadProtection",
      "localMailEvictedMessages",
      "mailMutations",
      "replyDrafts",
      "mailboxMessages",
      "threadRows",
      "threadDetails",

      "localMailAttachmentFiles",
      "localMailAttachmentJobs",
    ],
    "readwrite",
  );
  const row = (await transaction
    .objectStore("localMailMessages")
    .get([scope.emailAccountId, "message"]))!;
  const result = await evictLocalMailMessage(transaction, row, 1, Date.now(), {
    recentAfter: Number.MAX_SAFE_INTEGER,
    fetchedAfter: Number.MAX_SAFE_INTEGER,
  });
  await transaction.done;
  return result;
}
