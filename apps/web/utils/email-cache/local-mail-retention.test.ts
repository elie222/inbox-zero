import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { readSearchIndexThreadPage } from "./search-index-source";
import { getMockMessage } from "@/__tests__/helpers";
import {
  clearEmailCache,
  clearEmailCacheForAccount,
  getEmailCacheDatabase,
} from "./database";
import {
  storeLocalMailMessages,
  deleteLocalMailMessages,
} from "./local-mail-messages";
import {
  beginLocalMailEviction,
  runLocalMailEvictionBatch,
  updateLocalMailThreadProtection,
} from "./local-mail-retention";

const emailAccountId = "account-1";
const generation = "generation-1";
const now = 100_000;
const lock = async <T>(work: () => Promise<T>) => work();
const writes = [
  "localMailAttachmentFiles",
  "localMailAttachmentJobs",
  "localMailThreadProtection",
  "localMailMessages",
  "localMailTombstones",
  "mailboxMessages",
  "searchIndexAccounts",
  "searchIndexWork",
  "localMailRetentionPolicies",
  "localMailEvictedMessages",
] as const;
beforeEach(async () => {
  await clearEmailCache();
  const db = (await getEmailCacheDatabase())!;
  await db.put("searchIndexAccounts", { emailAccountId, generation });
  await db.put("localMailSyncStates", {
    emailAccountId,
    generation,
    fence: 1,
    strategy: "account-history",
    retentionAfter: 0,
    retainedAfter: 0,
    snapshotBefore: now,
    nextWindowSize: 1000,
    excludedFolderIds: [],
    folders: {},
    discoveryGeneration: 1,
    discoveryComplete: true,
    coverage: { after: 0, before: now },
    nextAttemptAt: 0,
  });
});

describe("local mail retention", () => {
  it("narrows coverage, removes bounded source/projection batches and resumes equal timestamps", async () => {
    await seed(["first", "second", "third"], 1000);
    const db = (await getEmailCacheDatabase())!;
    const original = (await db.get("searchIndexAccounts", emailAccountId))!
      .messageBytes!;
    await begin();
    expect(
      (await db.get("localMailSyncStates", emailAccountId))?.coverage,
    ).toEqual({ after: 5000, before: now });
    expect((await batch(1))?.stage).toBe("remove-source");
    expect(await db.count("localMailMessages")).toBe(2);
    await batch(1);
    const result = await batch(1);
    expect(result?.stage).toBe("drain-index");
    expect(result?.removedBytes).toBe(original);
    expect(await db.count("mailboxMessages")).toBe(0);
    expect(await db.count("localMailTombstones")).toBe(0);
    expect(await db.count("localMailEvictedMessages")).toBe(3);
    expect(
      (await db.get("searchIndexAccounts", emailAccountId))?.messageBytes,
    ).toBe(0);
    expect(
      (await db.get("searchIndexAccounts", emailAccountId))
        ?.evictionMarkerBytes,
    ).toBeGreaterThan(0);
    expect(await db.count("searchIndexWork")).toBe(3);
  });

  it("resumes more than one full batch without skipping equal-date IDs and refreshes index work tokens", async () => {
    const ids = Array.from(
      { length: 105 },
      (_, index) => `message-${String(index).padStart(3, "0")}`,
    );
    await seed(ids, 1000);
    const db = (await getEmailCacheDatabase())!;
    const token = (
      await db.get("searchIndexWork", [emailAccountId, "thread-message-000"])
    )?.token;
    await begin();
    await batch();
    expect(await db.count("localMailMessages")).toBe(5);
    expect(
      (await db.get("searchIndexWork", [emailAccountId, "thread-message-000"]))
        ?.token,
    ).not.toBe(token);
    expect((await batch())?.stage).toBe("drain-index");
    expect(await db.count("localMailMessages")).toBe(0);
    const markers = await db.getAll("localMailEvictedMessages");
    expect(markers).toHaveLength(105);
    expect(
      (await db.get("searchIndexAccounts", emailAccountId))
        ?.evictionMarkerBytes,
    ).toBe(
      markers.reduce(
        (sum, marker) => sum + new Blob([JSON.stringify(marker)]).size,
        0,
      ),
    );
  });

  it("protects recently opened, newly imported and unsent threads without blocking scan", async () => {
    await seed(["opened", "draft", "failed", "eligible"], 1000);
    await seed(["imported"], 1000, now - 1);
    const db = (await getEmailCacheDatabase())!;
    await db.put("localMailThreadProtection", {
      emailAccountId,
      threadId: "thread-opened",
      generation,
      recentlyOpenedUntil: now + 1000,
    });
    await db.put("replyDrafts", {
      emailAccountId,
      threadId: "thread-draft",
      messageId: "draft",
      revision: 1,
      content: {
        values: { to: "recipient@example.com", subject: "Draft" },
        draft: {
          editableHtml: "Unsent",
          mode: "rich",
          quotedHtml: "",
          signatureHtml: "",
          unsupported: [],
        },
        preservedBlocks: [],
        attachments: [],
      },
      updatedAt: now,
    });
    await db.put("mailMutations", {
      id: "mutation",
      batchId: "batch",
      emailAccountId,
      threadId: "thread-failed",
      messageIds: ["failed"],
      kind: "reply",
      payload: {},
      status: "failed",
      attempts: 1,
      nextAttemptAt: 0,
      createdAt: now,
      updatedAt: now,
    });
    await begin();
    expect((await batch())?.stage).toBe("drain-index");
    expect(
      await db.get("localMailMessages", [emailAccountId, "eligible"]),
    ).toBeUndefined();
    for (const id of ["opened", "draft", "failed", "imported"])
      expect(
        await db.get("localMailMessages", [emailAccountId, id]),
      ).toBeDefined();
    expect(await db.count("replyDrafts")).toBe(1);
    expect(await db.count("mailMutations")).toBe(1);
  });

  it("rechecks exception protections in every bounded batch and indexes deletion of the last row", async () => {
    await seed(["first", "second"], 1000);
    const db = (await getEmailCacheDatabase())!;
    for (const id of ["first", "second"])
      await updateLocalMailThreadProtection({
        emailAccountId,
        generation,
        threadId: `thread-${id}`,
        reservation: { id: "hold", bytes: 1, expiresAt: now + 60_000 },
        now,
        withStorageLock: lock,
      });
    await begin();
    await batch();
    await db.delete("localMailEvictionJobs", emailAccountId);
    for (const id of ["first", "second"])
      await updateLocalMailThreadProtection({
        emailAccountId,
        generation,
        threadId: `thread-${id}`,
        reservation: { id: "hold", bytes: 0, expiresAt: now },
        now,
        withStorageLock: lock,
      });
    const before = (await db.get("localMailSyncStates", emailAccountId))!;
    const job = await begin({ kind: "exceptions" });
    expect(job?.revision).toBe(2);
    await updateLocalMailThreadProtection({
      emailAccountId,
      generation,
      threadId: "thread-first",
      reservation: { id: "hold", bytes: 1, expiresAt: now + 60_000 },
      now,
      withStorageLock: lock,
    });
    const options = {
      emailAccountId,
      generation,
      revision: 2,
      now,
      limit: 1,
      withStorageLock: lock,
    };
    expect((await runLocalMailEvictionBatch(options))?.stage).toBe(
      "remove-source",
    );
    expect(await db.count("localMailMessages")).toBe(2);
    expect((await runLocalMailEvictionBatch(options))?.stage).toBe(
      "drain-index",
    );
    expect(
      await db.get("localMailMessages", [emailAccountId, "first"]),
    ).toBeDefined();
    expect(
      await db.get("localMailMessages", [emailAccountId, "second"]),
    ).toBeUndefined();
    expect(
      (await db.get("localMailSyncStates", emailAccountId))?.coverage,
    ).toEqual(before.coverage);
    const work = (await db.get("searchIndexWork", [
      emailAccountId,
      "thread-second",
    ]))!;
    expect(
      await readSearchIndexThreadPage({
        emailAccountId,
        generation,
        threadId: "thread-second",
        token: work.token,
      }),
    ).toEqual({ messages: [], nextMessageId: undefined });
  });

  it("suppresses generic reload/current writes but permits explicit restoration with fresh context", async () => {
    await seed(["evicted"], 1000);
    await begin();
    await batch();
    await seed(["evicted"], 1000, now + 1, "current");
    const db = (await getEmailCacheDatabase())!;
    expect(await db.count("localMailMessages")).toBe(0);
    await expect(seed(["evicted"], 1000, now + 1)).rejects.toThrow(
      "retention context",
    );
    await seed(["evicted"], 1000, now + 1, "restore");
    expect(await db.count("localMailMessages")).toBe(1);
    expect(await db.count("localMailEvictedMessages")).toBe(0);
    expect(
      (await db.get("searchIndexAccounts", emailAccountId))
        ?.evictionMarkerBytes,
    ).toBe(0);
    expect(
      (await db.get("localMailRetentionPolicies", emailAccountId))
        ?.automaticAfter,
    ).toBe(5000);
  });

  it("allows unseen old imports but blocks historical intake below the floor", async () => {
    await begin();
    await seed(["old-history"], 1000, now + 1, "backfill");
    await seed(["new-import"], 1000, now + 1, "current");
    const db = (await getEmailCacheDatabase())!;
    expect(
      await db.get("localMailMessages", [emailAccountId, "old-history"]),
    ).toBeUndefined();
    expect(
      await db.get("localMailMessages", [emailAccountId, "new-import"]),
    ).toBeDefined();
  });

  it("removes compact rows replayed by a writer when retention suppresses their messages", async () => {
    await seed(["evicted"], 1000);
    const db = (await getEmailCacheDatabase())!;
    const projection = (await db.get("mailboxMessages", [
      emailAccountId,
      "evicted",
    ]))!;
    await begin();
    await batch();
    for (const [id, purpose] of [
      ["evicted", "current"],
      ["old-history", "backfill"],
    ] as const) {
      await db.put("mailboxMessages", {
        ...projection,
        messageId: id,
        data: { ...projection.data, id },
      });
      await seed([id], 1000, now + 1, purpose);
      expect(
        await db.get("localMailMessages", [emailAccountId, id]),
      ).toBeUndefined();
      expect(
        await db.get("mailboxMessages", [emailAccountId, id]),
      ).toBeUndefined();
    }
  });

  it("keeps provider deletion authoritative and clears local suppression separately", async () => {
    await seed(["removed"], 1000);
    await begin();
    await batch();
    const db = (await getEmailCacheDatabase())!;
    const tx = db.transaction(writes, "readwrite");
    await deleteLocalMailMessages(tx, emailAccountId, ["removed"], now + 1);
    await tx.done;
    expect(await db.count("localMailEvictedMessages")).toBe(0);
    expect(
      (await db.get("localMailTombstones", [emailAccountId, "removed"]))
        ?.threadId,
    ).toBe("thread-removed");
    await seed(["removed"], 1000, now, "restore");
    expect(await db.count("localMailMessages")).toBe(0);
  });

  it("rolls back source deletion, counters and checkpoint when the final checkpoint write fails", async () => {
    await seed(["unchanged"], 1000);
    await begin();
    const db = (await getEmailCacheDatabase())!;
    const bytes = (await db.get("searchIndexAccounts", emailAccountId))
      ?.messageBytes;
    const put = IDBObjectStore.prototype.put;
    const failing = vi
      .spyOn(IDBObjectStore.prototype, "put")
      .mockImplementation(function (
        this: IDBObjectStore,
        ...args: Parameters<typeof put>
      ) {
        if (this.name === "localMailEvictionJobs")
          throw new Error("checkpoint failure");
        return put.apply(this, args);
      });
    try {
      await expect(batch()).rejects.toThrow("checkpoint failure");
    } finally {
      failing.mockRestore();
    }
    expect(await db.count("localMailMessages")).toBe(1);
    expect(await db.count("mailboxMessages")).toBe(1);
    expect(await db.count("localMailEvictedMessages")).toBe(0);
    expect(
      (await db.get("searchIndexAccounts", emailAccountId))?.messageBytes,
    ).toBe(bytes);
    expect(
      (await db.get("localMailEvictionJobs", emailAccountId))?.cursor,
    ).toBeUndefined();
  });

  it("merges independently owned reservations and rejects protection after cleanup", async () => {
    const options = {
      emailAccountId,
      generation,
      threadId: "thread-reserved",
      now,
      withStorageLock: lock,
    };
    await updateLocalMailThreadProtection({
      ...options,
      reservation: { id: "open", bytes: 10, expiresAt: now + 1000 },
    });
    await updateLocalMailThreadProtection({
      ...options,
      reservation: { id: "pin", bytes: 20, expiresAt: now + 1000 },
    });
    await updateLocalMailThreadProtection({
      ...options,
      reservation: { id: "open", bytes: 0, expiresAt: now },
    });
    const db = (await getEmailCacheDatabase())!;
    expect(
      (
        await db.get("localMailThreadProtection", [
          emailAccountId,
          options.threadId,
        ])
      )?.reservations,
    ).toEqual({ pin: { bytes: 20, expiresAt: now + 1000 } });
    await seed(["reserved"], 1000);
    await begin();
    await batch();
    expect(
      await db.get("localMailMessages", [emailAccountId, "reserved"]),
    ).toBeDefined();
    expect(
      await updateLocalMailThreadProtection({
        ...options,
        withStorageLock: async (commit) => {
          await clearEmailCacheForAccount(emailAccountId);
          return commit();
        },
      }),
    ).toBe(false);
    expect(await db.count("localMailThreadProtection")).toBe(0);
  });

  it("rejects interior/incomplete ranges and fences cleanup or replacement generations", async () => {
    await expect(begin({ after: 1 })).rejects.toThrow("oldest coverage");
    await expect(begin({ before: now + 1 })).rejects.toThrow();
    await begin();
    const db = (await getEmailCacheDatabase())!;
    await db.put("searchIndexAccounts", {
      emailAccountId,
      generation: "replacement",
    });
    await expect(batch()).rejects.toThrow("checkpoint is stale");
    await clearEmailCacheForAccount(emailAccountId);
    expect(await db.count("localMailRetentionPolicies")).toBe(0);
    expect(await db.count("localMailEvictionJobs")).toBe(0);
  });
});

async function begin(
  overrides: Partial<Parameters<typeof beginLocalMailEviction>[0]> = {},
) {
  return beginLocalMailEviction({
    emailAccountId,
    generation,
    after: 0,
    before: 5000,
    now,
    protectedRecentAfter: 10_000,
    protectedFetchedAfter: 50_000,
    withStorageLock: lock,
    ...overrides,
  });
}
async function batch(limit = 100) {
  return runLocalMailEvictionBatch({
    emailAccountId,
    generation,
    revision: 1,
    now,
    limit,
    withStorageLock: lock,
  });
}
async function seed(
  ids: string[],
  timestamp: number,
  fetchedAt = 1,
  purpose?: "current" | "restore" | "backfill",
) {
  const db = (await getEmailCacheDatabase())!;
  const tx = db.transaction(writes, "readwrite");
  try {
    await storeLocalMailMessages(
      tx,
      emailAccountId,
      ids.map((id) => ({
        ...getMockMessage({ id, threadId: `thread-${id}` }),
        internalDate: String(timestamp),
      })),
      fetchedAt,
      purpose ? { retention: { revision: 1, purpose } } : undefined,
    );
    await tx.done;
  } catch (error) {
    try {
      tx.abort();
    } catch {}
    await tx.done.catch(() => undefined);
    throw error;
  }
}
