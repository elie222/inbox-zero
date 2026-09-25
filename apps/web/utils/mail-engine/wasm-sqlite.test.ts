import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyReferenceChange,
  createReferenceModel,
  referenceMailbox,
  setReferencePending,
} from "@inboxzero/mail-core/test-support/reference-model";
import { archiveThenNewMailScenario } from "@inboxzero/mail-core/test-support/scenarios";
import type { ProviderChange } from "@inboxzero/mail-core/sync";
import type { MailStore } from "@inboxzero/mail-core/ports/mail-store";
import type { SqliteDriver } from "@inboxzero/mail-sqlite/driver";
import { createSqliteMailStore } from "@inboxzero/mail-sqlite/store";
import {
  MAIL_ENGINE_OPFS_DIRECTORY,
  createWasmSqliteDriver,
  wipeOpfsMailEngine,
} from "./wasm-sqlite";

const inboxQuery = {
  accountIds: ["acc-1"],
  predicate: { kind: "role" as const, role: "inbox" as const },
  order: "newest_first" as const,
  pageSize: 10,
  after: null,
};

describe("browser wasm sqlite driver", () => {
  it("runs the shared store on an in-memory sqlite-wasm database", async () => {
    const driver = await createWasmSqliteDriver({ persist: false });
    const store = await createSqliteMailStore(driver);
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const view = await store.readMailboxView(inboxQuery);
    expect(view.view.counts.matchingConversations).toBe(0);
    await store.close();
  });

  it("keeps archive and new-mail counts aligned on the wasm driver", async () => {
    const driver = await createWasmSqliteDriver({ persist: false });
    const store = await createSqliteMailStore(driver);
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "bootstrap",
        from: { streamId: "primary", generation: "g1", checkpoint: null },
        to: { streamId: "primary", generation: "g1", checkpoint: "1" },
        changes: [
          messagePatch("m1", "c1", 1000, ["inbox"]),
          messagePatch("m2", "c2", 2000, ["inbox"]),
        ],
        requiredHydration: [],
        roundComplete: true,
      },
    });
    const before = await store.readMailboxView(inboxQuery);
    expect(before.view.counts.matchingConversations).toBe(2);

    const admission = await store.admitMetadata({
      accountId: "acc-1",
      commandId: "archive-c1",
      targets: [{ accountId: "acc-1", messageId: "m1" }],
      change: { kind: "archive" },
    });
    expect(admission.status).toBe("queued");
    const pending = await store.readMailboxView(inboxQuery);
    expect(pending.view.counts.matchingConversations).toBe(1);
    expect(
      pending.view.conversations.map((row) => row.key.conversationId),
    ).toEqual(["c2"]);

    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "new-mail",
        from: { streamId: "primary", generation: "g1", checkpoint: "1" },
        to: { streamId: "primary", generation: "g1", checkpoint: "2" },
        changes: [messagePatch("m3", "c1", 3000, ["inbox"])],
        requiredHydration: [],
        roundComplete: true,
      },
    });
    const returned = await store.readMailboxView(inboxQuery);
    expect(
      returned.view.conversations.map((row) => row.key.conversationId).sort(),
    ).toEqual(["c1", "c2"]);
    await store.close();
  });

  it("matches the shared archive-then-new-mail fixture on sqlite-wasm", async () => {
    const driver = await createWasmSqliteDriver({ persist: false });
    const store = await createSqliteMailStore(driver);
    await store.ensureAccount({
      accountId: "a1",
      provider: "google",
      generation: "g1",
    });
    const reference = createReferenceModel();
    let checkpoint: string | null = null;
    let observationIndex = 0;
    for (const event of archiveThenNewMailScenario) {
      if (event.kind === "observe") {
        applyReferenceChange(reference, event.change);
        const requestId =
          "key" in event.change ? event.change.key.messageId : event.change.id;
        observationIndex += 1;
        const nextCheckpoint = `${requestId}-${observationIndex}`;
        await store.applySyncPage({
          ownerId: "owner",
          page: {
            session: { accountId: "a1", generation: "g1" },
            requestId,
            from: { streamId: "primary", generation: "g1", checkpoint },
            to: {
              streamId: "primary",
              generation: "g1",
              checkpoint: nextCheckpoint,
            },
            changes: [event.change],
            requiredHydration: [],
            roundComplete: true,
          },
        });
        checkpoint = nextCheckpoint;
      }
      if (event.kind === "admit") {
        setReferencePending(reference, [
          ...reference.pending,
          {
            operationId: event.operationId,
            change: event.change,
            targets: event.targets,
          },
        ]);
        await store.admitMetadata({
          accountId: "a1",
          commandId: event.operationId,
          targets: event.targets,
          change: event.change,
        });
      }
      if (event.kind === "clearPending") {
        setReferencePending(
          reference,
          reference.pending.filter(
            (item) => item.operationId !== event.operationId,
          ),
        );
        const operation = await store.readOperation({
          accountId: "a1",
          operationId: event.operationId,
        });
        if (operation.operation) {
          await store.settleAttempt({
            attemptId: "clear",
            operation: {
              key: { accountId: "a1", operationId: event.operationId },
              session: { accountId: "a1", generation: "g1" },
              authority: "backend",
              payloadHash: "x",
              intent: {
                kind: "metadata",
                targets: [{ accountId: "a1", messageId: "m1" }],
                change: { kind: "archive" },
              },
            },
            result: {
              status: "confirmed",
              receiptId: "done",
              observations: [],
              targets: [],
            },
          });
        }
      }
    }
    const view = await store.readMailboxView({
      accountIds: ["a1"],
      predicate: { kind: "role", role: "inbox" },
      order: "newest_first",
      pageSize: 25,
      after: null,
    });
    const expected = referenceMailbox(reference, ["a1"], {
      kind: "role",
      role: "inbox",
    });
    expect(view.view.counts.matchingConversations).toBe(
      expected.matchingConversations,
    );
    expect(
      view.view.conversations.map(
        (row) => `${row.key.accountId}:${row.key.conversationId}`,
      ),
    ).toEqual(expected.conversations);
    await store.close();
  });

  it("rebuilds a legacy search index without its text copy on sqlite-wasm", async () => {
    const driver = await createWasmSqliteDriver({ persist: false });
    const store = await createSqliteMailStore(driver);
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "bootstrap",
        from: { streamId: "primary", generation: "g1", checkpoint: null },
        to: { streamId: "primary", generation: "g1", checkpoint: "1" },
        changes: [
          messagePatch("m1", "c1", 1000, ["inbox"]),
          messagePatch("m2", "c2", 2000, ["inbox"]),
        ],
        requiredHydration: [],
        roundComplete: true,
      },
      bodies: [
        {
          key: { accountId: "acc-1", messageId: "m1" },
          version: "1",
          text: "quarterly invoice",
          html: null,
        },
      ],
    });
    await driver.write(async (tx) => {
      await tx.exec(
        `DROP TABLE message_fts;
         DELETE FROM message_fts_keys;
         DELETE FROM schema_migrations WHERE id = 6;
         CREATE VIRTUAL TABLE message_fts USING fts5(account_id UNINDEXED, message_id UNINDEXED, subject, preview, from_address, body);
         INSERT INTO message_fts(account_id, message_id, subject, preview, from_address, body)
           SELECT 'acc-1', 'm1', 'c1', 'm1', 'ada@example.com', 'quarterly invoice';
         INSERT INTO message_fts_keys SELECT account_id, message_id, rowid FROM message_fts;`,
      );
    });

    const reopened = await createSqliteMailStore(driver);
    while ((await reopened.indexSearchBacklog()).remaining) {
      // keep indexing
    }
    expect(await searchMatches(driver, "invoice")).toEqual(["m1"]);

    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "body-update",
        from: { streamId: "primary", generation: "g1", checkpoint: "1" },
        to: { streamId: "primary", generation: "g1", checkpoint: "2" },
        changes: [],
        requiredHydration: [],
        roundComplete: true,
      },
      bodies: [
        {
          key: { accountId: "acc-1", messageId: "m1" },
          version: "2",
          text: "updated receipt",
          html: null,
        },
      ],
    });
    expect(await searchMatches(driver, "invoice")).toEqual([]);
    expect(await searchMatches(driver, "receipt")).toEqual(["m1"]);
    await store.close();
  });

  it("compresses stored bodies on sqlite-wasm, including rows written before compression", async () => {
    const driver = await createWasmSqliteDriver({ persist: false });
    const store = await createSqliteMailStore(driver);
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const html = `<div>${"<p>Weekly product digest</p>".repeat(50)}</div>`;
    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "bootstrap",
        from: { streamId: "primary", generation: "g1", checkpoint: null },
        to: { streamId: "primary", generation: "g1", checkpoint: "1" },
        changes: [
          messagePatch("m1", "c1", 1000, ["inbox"]),
          messagePatch("m2", "c1", 2000, ["inbox"]),
        ],
        requiredHydration: [],
        roundComplete: true,
      },
      bodies: [
        {
          key: { accountId: "acc-1", messageId: "m1" },
          version: "1",
          text: "Weekly product digest",
          html,
        },
        {
          key: { accountId: "acc-1", messageId: "m2" },
          version: "1",
          text: "Plain reply",
          html: null,
        },
      ],
    });
    const compressed = [
      { html, text: null },
      { html: null, text: "Plain reply" },
    ];
    expect(await conversationBodies(store)).toEqual(compressed);

    await driver.write(async (tx) => {
      await tx.execute(
        "UPDATE message_content SET html = ?, text = ? WHERE message_id = 'm1'",
        [html, "Weekly product digest"],
      );
      await tx.execute("DELETE FROM schema_migrations WHERE id = 8");
    });
    const reopened = await createSqliteMailStore(driver);
    expect((await conversationBodies(reopened))[0]).toEqual({
      html,
      text: "Weekly product digest",
    });
    while ((await reopened.compressBodyBacklog()).remaining) {
      // keep compressing
    }

    expect(await conversationBodies(reopened)).toEqual(compressed);
    const [stored] = await driver.read((tx) =>
      tx.query(
        "SELECT typeof(html) AS html, typeof(text) AS text, length(html) AS size FROM message_content WHERE message_id = 'm1'",
      ),
    );
    expect(stored).toMatchObject({ html: "blob", text: "null" });
    expect(Number(stored?.size)).toBeLessThan(html.length / 10);
    await reopened.close();
  });
});

async function conversationBodies(store: MailStore) {
  const { view } = await store.readConversation(
    { accountId: "acc-1", conversationId: "c1" },
    { after: null, pageSize: 10 },
  );
  return view.messages.map((message) =>
    message.content.status === "available"
      ? { html: message.content.html, text: message.content.text }
      : null,
  );
}

async function searchMatches(driver: SqliteDriver, term: string) {
  const rows = await driver.read((tx) =>
    tx.query(
      `SELECT k.message_id FROM message_fts
       JOIN message_fts_keys k ON k.fts_rowid = message_fts.rowid
       WHERE message_fts MATCH ? ORDER BY k.message_id`,
      [term],
    ),
  );
  return rows.map((row) => String(row.message_id));
}

function messagePatch(
  messageId: string,
  conversationId: string,
  receivedAtMs: number,
  roles: Array<"inbox" | "sent" | "draft" | "trash" | "spam">,
): Extract<ProviderChange, { kind: "message_patch" }> {
  return {
    kind: "message_patch",
    key: { accountId: "acc-1", messageId },
    reference: {
      provider: "google",
      messageId,
      conversationId,
      version: "1",
    },
    fields: {
      subject: conversationId,
      preview: messageId,
      from: "ada@example.com",
      to: ["me@example.com"],
      cc: [],
      receivedAtMs,
      read: false,
      starred: false,
      folderId: roles.includes("inbox") ? "inbox" : "archive",
      labelIds: roles.includes("inbox") ? ["INBOX"] : [],
      categoryIds: [],
      roles,
      hasAttachments: false,
    },
  };
}

describe("wipeOpfsMailEngine", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("removes the mail-engine OPFS directory", async () => {
    const removeEntry = vi.fn();
    vi.stubGlobal("navigator", {
      storage: {
        getDirectory: async () => ({ removeEntry }),
      },
    });
    await wipeOpfsMailEngine();
    expect(removeEntry).toHaveBeenCalledWith(MAIL_ENGINE_OPFS_DIRECTORY, {
      recursive: true,
    });
  });

  it("ignores a missing OPFS directory", async () => {
    vi.stubGlobal("navigator", {
      storage: {
        getDirectory: async () => ({
          removeEntry: async () => {
            throw Object.assign(new Error("missing"), {
              name: "NotFoundError",
            });
          },
        }),
      },
    });
    await expect(wipeOpfsMailEngine()).resolves.toBeUndefined();
  });

  it("retries removeEntry while the SAHPool still holds the directory", async () => {
    vi.useFakeTimers();
    const removeEntry = vi
      .fn()
      .mockRejectedValueOnce(
        Object.assign(new Error("busy"), { name: "InvalidStateError" }),
      )
      .mockResolvedValueOnce(undefined);
    vi.stubGlobal("navigator", {
      storage: {
        getDirectory: async () => ({ removeEntry }),
      },
    });
    const done = wipeOpfsMailEngine();
    await vi.runAllTimersAsync();
    await done;
    expect(removeEntry).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });
});
