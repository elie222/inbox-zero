import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import type { ProviderChange } from "@inboxzero/mail-core/sync";
import { createNodeSqliteDriver } from "./node-sqlite";
import { createSqliteMailStore } from "./store";

const ACCOUNT_TABLES = [
  "message_content",
  "effective_messages",
  "operation_targets",
  "operation_conversations",
  "operations",
  "drafts",
  "assistant_entries",
  "sync_streams",
  "bootstrap_seen_messages",
  "bootstrap_existing_messages",
  "bootstrap_scans",
  "coverage",
  "sync_jobs",
  "conversation_completeness",
  "messages",
  "accounts",
] as const;

describe("sqlite mail store purgeAccount", () => {
  it("drops one account from every mailbox table and keeps the other", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-purge-"));
    const path = join(directory, "mailbox.sqlite");
    const store = await createSqliteMailStore(createNodeSqliteDriver(path));
    await seedAccount(store, "acc-1", "c-1", "m-1", { pendingWork: true });
    await seedAccount(store, "acc-2", "c-2", "m-2");
    const before = await store.inspect();
    expect(
      before.operations.some(
        (operation) => operation.key.accountId === "acc-1",
      ),
    ).toBe(true);
    expect(before.coverage.some((item) => item.accountId === "acc-1")).toBe(
      true,
    );

    const purged = await store.purgeAccount("acc-1");
    expect(purged.sequence).toBeGreaterThan(0);
    const remaining = await store.readMailboxView(inboxQuery("acc-2"));
    expect(
      remaining.view.conversations.map((row) => row.key.conversationId),
    ).toEqual(["c-2"]);
    await store.close();

    const counts = countAccountRows(path, "acc-1");
    for (const table of ACCOUNT_TABLES) {
      expect(counts[table], table).toBe(0);
    }
    expect(counts.message_fts).toBe(0);
    expect(counts.unkeyed_fts).toBe(0);
    const remainingCounts = countAccountRows(path, "acc-2");
    expect(remainingCounts.accounts).toBe(1);
    expect(remainingCounts.messages).toBe(1);
    expect(remainingCounts.message_content).toBe(1);
    expect(remainingCounts.drafts).toBe(1);
    expect(remainingCounts.sync_streams).toBe(1);
    expect(remainingCounts.coverage).toBeGreaterThan(0);
    expect(remainingCounts.message_fts).toBeGreaterThan(0);
    await rm(directory, { recursive: true, force: true });
  });

  it("cleans leftover FTS without bumping revision when the account row is gone", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-purge-fts-"));
    const path = join(directory, "mailbox.sqlite");
    const store = await createSqliteMailStore(createNodeSqliteDriver(path));
    await seedAccount(store, "acc-1", "c-1", "m-1");
    await seedAccount(store, "acc-2", "c-2", "m-2");
    await store.close();

    const db = new DatabaseSync(path);
    db.exec("PRAGMA foreign_keys = OFF");
    db.exec("DELETE FROM accounts WHERE account_id = 'acc-1'");
    db.close();
    expect(countAccountRows(path, "acc-1").message_fts).toBeGreaterThan(0);

    const reopened = await createSqliteMailStore(createNodeSqliteDriver(path));
    const before = await reopened.inspect();
    const purged = await reopened.purgeAccount("acc-1");
    expect(purged).toEqual(before.revision);
    await reopened.close();
    const counts = countAccountRows(path, "acc-1");
    expect(counts.message_fts).toBe(0);
    expect(counts.unkeyed_fts).toBe(0);
    expect(countAccountRows(path, "acc-2").accounts).toBe(1);
    await rm(directory, { recursive: true, force: true });
  });

  it("is a no-op for an account that was never stored", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await seedAccount(store, "acc-2", "c-2", "m-2");
    const before = await store.inspect();
    const purged = await store.purgeAccount("acc-missing");
    const after = await store.inspect();
    expect(purged).toEqual(before.revision);
    expect(after.accounts.map((account) => account.accountId)).toEqual([
      "acc-2",
    ]);
    await store.close();
  });
});

function inboxQuery(accountId: string) {
  return {
    accountIds: [accountId],
    predicate: { kind: "role" as const, role: "inbox" as const },
    order: "newest_first" as const,
    pageSize: 25,
    after: null,
  };
}

async function seedAccount(
  store: Awaited<ReturnType<typeof createSqliteMailStore>>,
  accountId: string,
  conversationId: string,
  messageId: string,
  options?: { pendingWork?: boolean },
) {
  await store.ensureAccount({
    accountId,
    provider: "google",
    generation: "g1",
  });
  await store.applySyncPage({
    ownerId: "owner",
    page: {
      session: { accountId, generation: "g1" },
      requestId: `boot-${accountId}`,
      from: { streamId: "primary", generation: "g1", checkpoint: null },
      to: { streamId: "primary", generation: "g1", checkpoint: "1" },
      changes: [messagePatch(accountId, conversationId, messageId)],
      requiredHydration: [],
      roundComplete: true,
    },
  });
  expectCommitted(
    await store.applyHydration({
      session: { accountId, generation: "g1" },
      requestId: `body-${accountId}`,
      changes: [],
      bodies: [
        {
          key: { accountId, messageId },
          version: "1",
          html: `<p>${accountId}</p>`,
          text: accountId,
        },
      ],
    }),
  );
  await store.saveDraft({
    key: { accountId, draftId: `d-${accountId}` },
    expectedRevision: null,
    content: {
      to: ["a@example.com"],
      cc: [],
      bcc: [],
      subject: accountId,
      editableHtml: `<p>${accountId}</p>`,
      quotedHtml: "",
      attachmentIds: [],
    },
  });
  if (!options?.pendingWork) return;
  await store.admitMetadata({
    accountId,
    commandId: `archive-${accountId}`,
    targets: [{ accountId, messageId }],
    change: { kind: "archive" },
  });
  const revision = (await store.readMailboxView(inboxQuery(accountId)))
    .revision;
  await store.admitConversations({
    accountId,
    commandId: `bulk-${accountId}`,
    conversations: [{ accountId, conversationId }],
    change: { kind: "trash" },
    observedRevision: revision,
  });
  const work = await store.claimWork({
    ownerId: "owner",
    nowMs: Date.now(),
    leaseMs: 30_000,
  });
  expect(work).toMatchObject({
    kind: "prepare",
    accountId,
    commandId: `bulk-${accountId}`,
  });
  if (work?.kind !== "prepare") throw new Error("expected preparation work");
  await store.applyPreparationPage({
    accountId,
    commandId: `bulk-${accountId}`,
    attemptId: work.attemptId,
    session: work.session,
    previousPage: work.page,
    page: {
      conversation: { accountId, conversationId },
      resolutionId: work.resolutionId,
      keys: [{ accountId, messageId }],
      changes: [],
      nextPage: null,
      evidence: null,
    },
  });
  await store.enqueueHydration({
    keys: [{ accountId, messageId }],
    purpose: "body",
  });
  await store.enqueueSearch({
    accountId,
    predicate: { kind: "role", role: "inbox" },
    page: null,
  });
}

function expectCommitted(result: { status: string }) {
  expect(result.status).toBe("committed");
}

function countAccountRows(path: string, accountId: string) {
  const db = new DatabaseSync(path);
  const counts: Record<string, number> = {};
  for (const table of ACCOUNT_TABLES) {
    const row = db
      .prepare(`SELECT COUNT(*) AS n FROM ${table} WHERE account_id = ?`)
      .get(accountId) as { n: number };
    counts[table] = Number(row.n);
  }
  const fts = db
    .prepare(
      `SELECT COUNT(*) AS n FROM message_fts_keys k
       JOIN message_fts f ON f.rowid = k.fts_rowid
       WHERE k.account_id = ?`,
    )
    .get(accountId) as { n: number };
  counts.message_fts = Number(fts.n);
  // A contentless index row without a key could never be found or removed.
  const unkeyed = db
    .prepare(
      "SELECT (SELECT COUNT(*) FROM message_fts) - (SELECT COUNT(*) FROM message_fts_keys) AS n",
    )
    .get() as { n: number };
  counts.unkeyed_fts = Number(unkeyed.n);
  db.close();
  return counts;
}

function messagePatch(
  accountId: string,
  conversationId: string,
  messageId: string,
): Extract<ProviderChange, { kind: "message_patch" }> {
  return {
    kind: "message_patch",
    key: { accountId, messageId },
    reference: {
      provider: "google",
      messageId,
      conversationId,
      version: "1",
    },
    fields: {
      subject: conversationId,
      preview: messageId,
      from: `${accountId}@example.com`,
      to: ["me@example.com"],
      cc: [],
      receivedAtMs: 1,
      read: false,
      starred: false,
      folderId: "inbox",
      labelIds: ["INBOX"],
      categoryIds: [],
      roles: ["inbox"],
      hasAttachments: false,
    },
  };
}
