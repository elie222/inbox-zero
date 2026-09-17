import { installMailCacheStorageTestEnvironment } from "./optional-cache-write.test-helpers";
// @vitest-environment jsdom
import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ParsedMessage } from "@/utils/types";
import { clearEmailCache, getEmailCacheDatabase } from "./database";
import { captureLocalMailCacheContext } from "./local-mail-cache-context";
import { activateMailSync } from "./mail-activation";
import { settleMailMutationInCache } from "./mail-mutation-settlement";
import { applyMailboxSyncPage, markSyncedMailboxThreadsRead } from "./mailbox";
import { seedSearchIndexWork } from "./search-index-seed";
import { SOURCE_VERSION } from "./search-index-source-version";
import { writeCachedThreadList, writeCachedThreadRows } from "./thread-lists";
import { writeCachedThreadDetail } from "./threads";

vi.mock("./cleanup", () => ({ scheduleEmailCacheCleanup: vi.fn() }));

const emailAccountId = "account-1";
const generation = "generation-1";
const now = Date.now();

installMailCacheStorageTestEnvironment();

beforeEach(clearEmailCache);

describe("retention fencing for legacy caches", () => {
  it.each([
    "detail",
    "list",
    "rows",
    "mailbox",
  ] as const)("rejects a delayed %s response without advancing local state", async (writer) => {
    const database = await seedPolicy(1);
    const cacheContext = await captureLocalMailCacheContext(emailAccountId);
    await seedPolicy(2);
    await writeResponse(writer, cacheContext);
    expect(await database.count("localMailMessages")).toBe(0);
    expect(await database.count("threadRows")).toBe(0);
    expect(await database.count("threadDetails")).toBe(0);
    expect(await database.count("threadViews")).toBe(0);
    expect(await database.count("mailboxSyncStates")).toBe(0);
  });

  it.each([
    "detail",
    "list",
    "rows",
    "mailbox",
  ] as const)("does not revive an evicted message through a fresh %s response", async (writer) => {
    const database = await seedPolicy(1);
    await database.put("localMailEvictedMessages", {
      emailAccountId,
      messageId: "message-1",
      threadId: "thread-1",
      revision: 1,
      receivedAt: now,
      evictedAt: now,
      byteSize: 100,
    });
    await writeResponse(
      writer,
      await captureLocalMailCacheContext(emailAccountId),
    );
    expect(await database.count("localMailMessages")).toBe(0);
    expect(await database.count("mailboxMessages")).toBe(0);
    expect(await database.count("threadRows")).toBe(0);
    expect(await database.count("threadDetails")).toBe(0);
    expect(await database.count("localMailTombstones")).toBe(0);
    expect(await database.count("localMailEvictedMessages")).toBe(1);
  });

  it.each([
    "detail",
    "list",
    "rows",
  ] as const)("does not persist below-floor content through %s snapshots", async (writer) => {
    const database = await seedPolicy(1);
    await database.put("localMailRetentionPolicies", {
      emailAccountId,
      generation,
      revision: 1,
      requestedAfter: 0,
      automaticAfter: now + 1,
    });
    await writeResponse(
      writer,
      await captureLocalMailCacheContext(emailAccountId),
    );
    expect(await database.count("localMailMessages")).toBe(0);
    expect(await database.count("threadRows")).toBe(0);
    expect(await database.count("threadDetails")).toBe(0);
  });

  it("hydrates an old imported message retained by the current stream", async () => {
    const database = await seedPolicy(1);
    await database.put("localMailRetentionPolicies", {
      emailAccountId,
      generation,
      revision: 1,
      requestedAfter: now + 1,
      automaticAfter: now + 1,
    });
    const cacheContext = await captureLocalMailCacheContext(emailAccountId);
    await applyMailboxSyncPage({
      emailAccountId,
      cacheContext,
      now,
      after: new Date(0),
      page: {
        cursor: "next",
        hasMore: false,
        reset: false,
        upsertedMessages: [{ ...message(), textPlain: undefined }],
        deletedMessageIds: [],
      },
    });
    await writeResponse("detail", cacheContext);
    expect(
      await database.get("localMailMessages", [emailAccountId, "message-1"]),
    ).toMatchObject({ data: { textPlain: "Body" }, bodyFetchedAt: now });
    expect(await database.count("threadDetails")).toBe(1);
  });

  it.each([
    "list",
    "rows",
  ] as const)("rejects %s aggregate metadata from a partially evicted thread", async (writer) => {
    const database = await seedPolicy(1);
    await database.put("localMailEvictedMessages", {
      emailAccountId,
      messageId: "older-message",
      threadId: "thread-1",
      revision: 1,
      receivedAt: now - 1,
      evictedAt: now,
      byteSize: 100,
    });
    const threads = [
      {
        id: "thread-1",
        messages: [message()],
        messageIds: ["message-1", "older-message"],
        participantMessages: [{ headers: { from: "old-sender@example.com" } }],
      },
    ];
    const cacheContext = await captureLocalMailCacheContext(emailAccountId);
    if (writer === "list")
      await writeCachedThreadList({
        emailAccountId,
        threads,
        cacheContext,
        viewKey: "inbox",
        hasMore: false,
        now,
      });
    else
      await writeCachedThreadRows({
        emailAccountId,
        threads,
        cacheContext,
        fetchedAt: now,
        now,
      });
    expect(await database.count("threadRows")).toBe(0);
  });

  it("rejects responses captured before retention first became active", async () => {
    const database = (await getEmailCacheDatabase())!;
    await database.put("searchIndexAccounts", {
      emailAccountId,
      generation,
      sourceVersion: SOURCE_VERSION,
    });
    const cacheContext = await captureLocalMailCacheContext(emailAccountId);
    await seedPolicy(1);
    await writeResponse("mailbox", cacheContext);
    expect(await database.count("mailboxSyncStates")).toBe(0);
    expect(await database.count("localMailMessages")).toBe(0);
  });

  it("accepts unknown old imports from the current stream", async () => {
    const database = await seedPolicy(1);
    await database.put("localMailRetentionPolicies", {
      emailAccountId,
      generation,
      revision: 1,
      requestedAfter: 0,
      automaticAfter: now + 1,
    });
    await writeResponse(
      "mailbox",
      await captureLocalMailCacheContext(emailAccountId),
    );
    expect(
      await database.get("localMailMessages", [emailAccountId, "message-1"]),
    ).toBeDefined();
    expect(
      await database.get("mailboxSyncStates", emailAccountId),
    ).toMatchObject({ cursor: "next" });
  });

  it("fails closed for network callers missing request context", async () => {
    const database = await seedPolicy(1);
    for (const writer of ["detail", "list", "rows", "mailbox"] as const)
      await writeResponse(writer, undefined);
    expect(await database.count("localMailMessages")).toBe(0);
    expect(await database.count("threadRows")).toBe(0);
    expect(await database.count("threadDetails")).toBe(0);
    expect(await database.count("mailboxSyncStates")).toBe(0);
  });

  it("keeps same-transaction read and mutation settlement working under retention", async () => {
    const database = await seedPolicy(1);
    await writeResponse(
      "detail",
      await captureLocalMailCacheContext(emailAccountId),
    );
    await markSyncedMailboxThreadsRead({
      emailAccountId,
      threadIds: ["thread-1"],
      read: true,
    });
    expect(
      await database.get("localMailMessages", [emailAccountId, "message-1"]),
    ).toMatchObject({ data: { labelIds: ["INBOX"] } });
    await settleMailMutationInCache({
      id: "mutation-1",
      batchId: "batch-1",
      nextAttemptAt: now,
      emailAccountId,
      threadId: "thread-1",
      messageIds: ["message-1"],
      kind: "set_starred_state",
      starred: true,
      status: "succeeded",
      createdAt: now,
      updatedAt: now,
      attempts: 1,
    });
    expect(
      await database.get("localMailMessages", [emailAccountId, "message-1"]),
    ).toMatchObject({ data: { labelIds: ["INBOX", "STARRED"] } });
  });

  it("seeds permitted legacy mail while keeping evicted IDs absent", async () => {
    activateMailSync(emailAccountId);
    const database = await seedPolicy(1);
    const account = await database.get("searchIndexAccounts", emailAccountId);
    await database.put("searchIndexAccounts", {
      ...account!,
      seed: { store: "threadRows" },
    });
    await database.put("threadRows", {
      emailAccountId,
      threadId: "thread-1",
      data: { messages: [message(), { ...message(), id: "retained" }] },
      fetchedAt: now,
      lastAccessedAt: now,
    });
    await database.put("localMailEvictedMessages", {
      emailAccountId,
      messageId: "message-1",
      threadId: "thread-1",
      revision: 1,
      receivedAt: now,
      evictedAt: now,
      byteSize: 100,
    });
    await seedSearchIndexWork(emailAccountId);
    expect(
      await database.get("localMailMessages", [emailAccountId, "message-1"]),
    ).toBeUndefined();
    expect(
      await database.get("localMailMessages", [emailAccountId, "retained"]),
    ).toBeDefined();
  });
});

async function seedPolicy(revision: number) {
  const database = (await getEmailCacheDatabase())!;
  await database.put("searchIndexAccounts", {
    emailAccountId,
    generation,
    sourceVersion: SOURCE_VERSION,
    retentionRevision: revision,
    messageBytes: 0,
  });
  await database.put("localMailRetentionPolicies", {
    emailAccountId,
    generation,
    revision,
    requestedAfter: 0,
    automaticAfter: 0,
  });
  return database;
}

async function writeResponse(
  writer: "detail" | "list" | "rows" | "mailbox",
  cacheContext: Awaited<ReturnType<typeof captureLocalMailCacheContext>>,
) {
  const thread = {
    id: "thread-1",
    historyId: "history-1",
    snippet: "Preview",
    messages: [message()],
  };
  if (writer === "detail")
    return writeCachedThreadDetail({
      emailAccountId,
      threadId: thread.id,
      variant: "drafts:0|replies:0",
      data: { thread },
      cacheContext,
      now,
    });
  if (writer === "list")
    return writeCachedThreadList({
      emailAccountId,
      viewKey: "inbox",
      threads: [thread],
      hasMore: false,
      cacheContext,
      now,
    });
  if (writer === "rows")
    return writeCachedThreadRows({
      emailAccountId,
      threads: [thread],
      fetchedAt: now,
      cacheContext,
      now,
    });
  return applyMailboxSyncPage({
    emailAccountId,
    cacheContext,
    now,
    after: new Date(0),
    page: {
      cursor: "next",
      hasMore: false,
      reset: false,
      upsertedMessages: [message()],
      deletedMessageIds: [],
    },
  });
}

function message(): ParsedMessage {
  return {
    id: "message-1",
    threadId: "thread-1",
    historyId: "history-1",
    snippet: "Preview",
    subject: "Subject",
    date: new Date(now).toISOString(),
    internalDate: String(now),
    headers: {
      from: "sender@example.com",
      to: "user@example.com",
      subject: "Subject",
      date: new Date(now).toISOString(),
    },
    labelIds: ["INBOX", "UNREAD"],
    textPlain: "Body",
    inline: [],
  };
}
