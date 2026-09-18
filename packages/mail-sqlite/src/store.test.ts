import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  createMailEngine,
  createHostRuntime,
} from "@inboxzero/mail-core/engine";
import type { MailboxSource } from "@inboxzero/mail-core/ports/mailbox-source";
import type { OperationExecutor } from "@inboxzero/mail-core/ports/operation-executor";
import type { ProviderChange } from "@inboxzero/mail-core/sync";
import {
  applyReferenceChange,
  createReferenceModel,
  referenceMailbox,
  setReferencePending,
} from "@inboxzero/mail-core/test-support/reference-model";
import { archiveThenNewMailScenario } from "@inboxzero/mail-core/test-support/scenarios";
import { createNodeSqliteDriver } from "./node-sqlite";
import { createSqliteMailStore } from "./store";

const inboxQuery = {
  accountIds: ["acc-1"],
  predicate: { kind: "role" as const, role: "inbox" as const },
  order: "newest_first" as const,
  pageSize: 25,
  after: null,
};

describe("sqlite mail store", () => {
  it("keeps two inbox queries and counts aligned across archive, new mail, and reopen", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-sqlite-"));
    const path = join(directory, "mailbox.sqlite");
    const driver = createNodeSqliteDriver(path);
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

    const first = await store.readMailboxView(inboxQuery);
    const second = await store.readMailboxView({
      ...inboxQuery,
      predicate: {
        kind: "all",
        predicates: [
          { kind: "role", role: "inbox" },
          { kind: "read", value: false },
        ],
      },
    });
    expect(first.view.counts.matchingConversations).toBe(2);
    expect(second.view.counts.matchingConversations).toBe(2);

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

    await store.close();

    const reopened = await createSqliteMailStore(createNodeSqliteDriver(path));
    const afterRestart = await reopened.readMailboxView(inboxQuery);
    expect(afterRestart.view.counts.matchingConversations).toBe(1);
    const operation = await reopened.readOperation({
      accountId: "acc-1",
      operationId: "archive-c1",
    });
    expect(operation.operation?.status).toBe("queued");

    await reopened.applySyncPage({
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
    const returned = await reopened.readMailboxView(inboxQuery);
    expect(
      returned.view.conversations.map((row) => row.key.conversationId).sort(),
    ).toEqual(["c1", "c2"]);
    await reopened.close();
    await rm(directory, { recursive: true, force: true });
  });

  it("rolls back a failed write without publishing a revision", async () => {
    const driver = createNodeSqliteDriver();
    await driver.write(async (tx) => {
      await tx.exec("CREATE TABLE demo(id INTEGER PRIMARY KEY, value TEXT)");
    });
    await expect(
      driver.write(async (tx) => {
        await tx.execute("INSERT INTO demo(id, value) VALUES (1, 'ok')");
        await tx.execute("INSERT INTO demo(id, value) VALUES (1, 'dup')");
      }),
    ).rejects.toThrow();
    const rows = await driver.read((tx) => tx.query("SELECT * FROM demo"));
    expect(rows).toEqual([]);
    await driver.close();
  });
});

describe("engine plus sqlite archive slice", () => {
  it("archives through the executor and reconciles both views", async () => {
    const messages = new Map([
      ["m1", messagePatch("m1", "c1", 1000, ["inbox"])],
      ["m2", messagePatch("m2", "c2", 2000, ["inbox"])],
    ]);
    const source = fixtureSource(messages);
    const executor: OperationExecutor = {
      async execute({ operation }) {
        if (operation.intent.kind !== "metadata") {
          return { status: "rejected", code: "unsupported", targets: [] };
        }
        for (const target of operation.intent.targets) {
          const current = messages.get(target.messageId);
          if (current?.kind !== "message_patch") continue;
          messages.set(
            target.messageId,
            messagePatch(
              target.messageId,
              current.reference.conversationId,
              current.fields.receivedAtMs ?? 0,
              [],
            ),
          );
        }
        return {
          status: "confirmed",
          receiptId: "r1",
          observations: operation.intent.targets.map(
            (target) => messages.get(target.messageId) as ProviderChange,
          ),
          targets: operation.intent.targets.map((key) => ({
            key,
            outcome: "applied" as const,
            code: null,
          })),
        };
      },
      async inspect(input) {
        return this.execute({ ...input, attemptId: "inspect" });
      },
    };
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const engine = createMailEngine({
      store,
      source,
      executor,
      runtime: createHostRuntime(),
    });
    await engine.requestSync(["acc-1"]);
    await engine.runUntil(Date.now() + 2000);
    const before = await store.readMailboxView(inboxQuery);
    expect(before.view.counts.matchingConversations).toBe(2);
    await engine.submitMetadata({
      accountId: "acc-1",
      commandId: "op-archive",
      targets: [{ accountId: "acc-1", messageId: "m1" }],
      change: { kind: "archive" },
    });
    await engine.runUntil(Date.now() + 2000);
    const after = await store.readMailboxView(inboxQuery);
    expect(after.view.counts.matchingConversations).toBe(1);
    expect(
      messages.get("m1")?.kind === "message_patch" && messages.get("m1"),
    ).toMatchObject({
      fields: { roles: [] },
    });
    await engine.close();
  });

  it("rebuilds from bootstrap when catch-up reports an expired position", async () => {
    const messages = new Map([
      ["m1", messagePatch("m1", "c1", 1000, ["inbox"])],
    ]);
    let changesCalls = 0;
    const source = fixtureSource(messages);
    const resetting: MailboxSource = {
      ...source,
      async readChanges(input) {
        changesCalls += 1;
        if (changesCalls === 1) {
          return { status: "reset_required", scopeId: "primary" };
        }
        return source.readChanges(input);
      },
      async enumerate() {
        return {
          status: "ok",
          value: {
            bootstrapId: "boot",
            scopeId: "primary",
            changes: [...messages.values()],
            requiredHydration: [],
            nextPage: null,
            catchUpFrom: {
              streamId: "primary",
              generation: "g1",
              checkpoint: "rebuilt",
            },
          },
        };
      },
    };
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "stale",
        from: { streamId: "primary", generation: "g1", checkpoint: null },
        to: { streamId: "primary", generation: "g1", checkpoint: "expired" },
        changes: [],
        requiredHydration: [],
        roundComplete: true,
      },
    });
    const engine = createMailEngine({
      store,
      source: resetting,
      executor: {
        async execute() {
          return { status: "uncertain", receiptId: null };
        },
        async inspect() {
          return { status: "uncertain", receiptId: null };
        },
      },
      runtime: createHostRuntime(),
    });
    await engine.requestSync(["acc-1"]);
    await engine.runUntil(Date.now() + 2000);
    const view = await store.readMailboxView(inboxQuery);
    expect(view.view.counts.matchingConversations).toBe(1);
    const inspection = await store.inspect();
    expect(inspection.streams[0]?.checkpoint).toBe("rebuilt");
    await engine.close();
  });
});

describe("drafts, freeze, and uncertain settlement", () => {
  it("rejects edits to a frozen draft and keeps uncertain operations after reopen", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-sqlite-drafts-"));
    const path = join(directory, "mailbox.sqlite");
    const store = await createSqliteMailStore(createNodeSqliteDriver(path));
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const saved = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d1" },
      expectedRevision: null,
      content: {
        to: ["ada@example.com"],
        cc: [],
        bcc: [],
        subject: "Hi",
        editableHtml: "<p>Hi</p>",
        quotedHtml: "",
        attachmentIds: [],
      },
    });
    expect(saved.status).toBe("saved");
    if (saved.status !== "saved") throw new Error("expected save");
    const send = await store.admitSend({
      commandId: "send-1",
      draft: { accountId: "acc-1", draftId: "d1" },
      draftRevision: saved.draftRevision,
      replyTo: null,
    });
    expect(send.status).toBe("queued");
    const conflict = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d1" },
      expectedRevision: saved.draftRevision,
      content: {
        to: ["ada@example.com"],
        cc: [],
        bcc: [],
        subject: "Hi later",
        editableHtml: "<p>Later</p>",
        quotedHtml: "",
        attachmentIds: [],
      },
    });
    expect(conflict.status).toBe("conflict");
    const work = await store.claimWork({
      ownerId: "owner",
      nowMs: Date.now(),
      leaseMs: 30_000,
    });
    expect(work?.kind).toBe("command");
    if (work?.kind !== "command") throw new Error("expected command");
    await store.settleAttempt({
      attemptId: work.attemptId,
      operation: work.operation,
      result: { status: "uncertain", receiptId: "r-lost" },
    });
    await store.close();
    const reopened = await createSqliteMailStore(createNodeSqliteDriver(path));
    const operation = await reopened.readOperation({
      accountId: "acc-1",
      operationId: "send-1",
    });
    expect(operation.operation?.status).toBe("uncertain");
    await reopened.close();
    await rm(directory, { recursive: true, force: true });
  });

  it("keeps conversation commands preparing until membership freeze", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "boot",
        from: { streamId: "primary", generation: "g1", checkpoint: null },
        to: { streamId: "primary", generation: "g1", checkpoint: "1" },
        changes: [messagePatch("m1", "c1", 1000, ["inbox"])],
        requiredHydration: [],
        roundComplete: true,
      },
    });
    const revision = (await store.readMailboxView(inboxQuery)).revision;
    const admission = await store.admitConversations({
      accountId: "acc-1",
      commandId: "archive-c1",
      conversations: [{ accountId: "acc-1", conversationId: "c1" }],
      change: { kind: "archive" },
      observedRevision: revision,
    });
    expect(admission.status).toBe("preparing");
    const work = await store.claimWork({
      ownerId: "owner",
      nowMs: Date.now(),
      leaseMs: 30_000,
    });
    expect(work?.kind).toBe("prepare");
    const cancelled = await store.cancelOperation({
      accountId: "acc-1",
      operationId: "archive-c1",
    });
    expect(cancelled.status).toBe("cancelled");
    const delayed = await store.applyPreparationPage({
      accountId: "acc-1",
      commandId: "archive-c1",
      page: {
        conversation: { accountId: "acc-1", conversationId: "c1" },
        resolutionId: "res-cancelled",
        keys: [{ accountId: "acc-1", messageId: "m1" }],
        changes: [],
        nextPage: null,
        evidence: null,
      },
    });
    expect(delayed.status).toBe("stale");
    await store.close();
  });

  it("includes arrivals observed during preparation and excludes messages after freeze", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "boot",
        from: { streamId: "primary", generation: "g1", checkpoint: null },
        to: { streamId: "primary", generation: "g1", checkpoint: "1" },
        changes: [messagePatch("m1", "c1", 1000, ["inbox"])],
        requiredHydration: [],
        roundComplete: true,
      },
    });
    const revision = (await store.readMailboxView(inboxQuery)).revision;
    const admission = await store.admitConversations({
      accountId: "acc-1",
      commandId: "archive-c1",
      conversations: [{ accountId: "acc-1", conversationId: "c1" }],
      change: { kind: "archive" },
      observedRevision: revision,
    });
    expect(admission.status).toBe("preparing");
    const duringPrep = await store.applyPreparationPage({
      accountId: "acc-1",
      commandId: "archive-c1",
      page: {
        conversation: { accountId: "acc-1", conversationId: "c1" },
        resolutionId: "res-1",
        keys: [
          { accountId: "acc-1", messageId: "m1" },
          { accountId: "acc-1", messageId: "m2" },
        ],
        changes: [messagePatch("m2", "c1", 1500, ["inbox"])],
        nextPage: null,
        evidence: null,
      },
    });
    expect(duringPrep.status).toBe("preparing");
    const frozen = await store.finishPreparation({
      accountId: "acc-1",
      commandId: "archive-c1",
    });
    expect(frozen.status).toBe("queued");
    const afterArrival = await store.applySyncPage({
      ownerId: "owner",
      page: {
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "late-mail",
        from: { streamId: "primary", generation: "g1", checkpoint: "1" },
        to: { streamId: "primary", generation: "g1", checkpoint: "2" },
        changes: [messagePatch("m3", "c1", 3000, ["inbox"])],
        requiredHydration: [],
        roundComplete: true,
      },
    });
    expect(afterArrival.status).toBe("committed");
    const delayed = await store.applyPreparationPage({
      accountId: "acc-1",
      commandId: "archive-c1",
      page: {
        conversation: { accountId: "acc-1", conversationId: "c1" },
        resolutionId: "res-late",
        keys: [{ accountId: "acc-1", messageId: "m3" }],
        changes: [],
        nextPage: null,
        evidence: null,
      },
    });
    expect(delayed.status).toBe("stale");
    const inspection = await store.inspect();
    const frozenIds = inspection.operationTargets
      .filter((target) => target.operationId === "archive-c1")
      .map((target) => target.messageId)
      .sort();
    expect(frozenIds).toEqual(["m1", "m2"]);
    const inbox = await store.readMailboxView(inboxQuery);
    expect(
      inbox.view.conversations.map((row) => row.key.conversationId),
    ).toEqual(["c1"]);
    await store.close();
  });
});

describe("sqlite crash recovery", () => {
  it("discards an uncommitted write after the connection closes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-sqlite-crash-"));
    const path = join(directory, "mailbox.sqlite");
    const store = await createSqliteMailStore(createNodeSqliteDriver(path));
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "boot",
        from: { streamId: "primary", generation: "g1", checkpoint: null },
        to: { streamId: "primary", generation: "g1", checkpoint: "1" },
        changes: [messagePatch("m1", "c1", 1000, ["inbox"])],
        requiredHydration: [],
        roundComplete: true,
      },
    });
    const before = await store.inspect();
    await store.close();

    const crashed = new DatabaseSync(path);
    crashed.exec("BEGIN IMMEDIATE");
    crashed.exec("UPDATE profile_state SET sequence = sequence + 100");
    crashed.close();

    const reopened = await createSqliteMailStore(createNodeSqliteDriver(path));
    const after = await reopened.inspect();
    expect(after.revision.sequence).toBe(before.revision.sequence);
    expect(after.messages).toHaveLength(1);
    expect(after.messages[0]?.messageId).toBe("m1");
    await reopened.close();
    await rm(directory, { recursive: true, force: true });
  });
});

describe("sqlite and reference model parity", () => {
  it("matches the archive-then-new-mail reference mailbox", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "a1",
      provider: "google",
      generation: "g1",
    });
    const reference = createReferenceModel();
    for (const event of archiveThenNewMailScenario) {
      if (event.kind === "observe") {
        applyReferenceChange(reference, event.change);
        const requestId =
          "key" in event.change ? event.change.key.messageId : event.change.id;
        await store.applySyncPage({
          ownerId: "owner",
          page: {
            session: { accountId: "a1", generation: "g1" },
            requestId,
            from: { streamId: "primary", generation: "g1", checkpoint: null },
            to: {
              streamId: "primary",
              generation: "g1",
              checkpoint: requestId,
            },
            changes: [event.change],
            requiredHydration: [],
            roundComplete: true,
          },
        });
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
});

function messagePatch(
  messageId: string,
  conversationId: string,
  receivedAtMs: number,
  roles: Array<"inbox" | "sent" | "draft" | "trash" | "spam">,
): ProviderChange {
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

function fixtureSource(messages: Map<string, ProviderChange>): MailboxSource {
  return {
    async describe() {
      return {
        status: "ok",
        value: {
          strategy: "account_history",
          supportedChanges: ["archive"],
          maxPageSize: 50,
          maxHydrationBatch: 20,
        },
      };
    },
    async discoverScopes() {
      return {
        status: "ok",
        value: {
          scopes: [{ id: "primary", kind: "account", folderId: null }],
          nextPage: null,
        },
      };
    },
    async beginBootstrap() {
      return {
        status: "ok",
        value: {
          bootstrapId: "boot",
          enumerationToken: "page-1",
          catchUpFrom: {
            streamId: "primary",
            generation: "g1",
            checkpoint: "1",
          },
        },
      };
    },
    async enumerate() {
      return {
        status: "ok",
        value: {
          bootstrapId: "boot",
          scopeId: "primary",
          changes: [...messages.values()],
          requiredHydration: [],
          nextPage: null,
          catchUpFrom: {
            streamId: "primary",
            generation: "g1",
            checkpoint: "1",
          },
        },
      };
    },
    async readChanges({ session }) {
      return {
        status: "page",
        page: {
          session,
          requestId: "changes",
          from: {
            streamId: "primary",
            generation: session.generation,
            checkpoint: null,
          },
          to: {
            streamId: "primary",
            generation: session.generation,
            checkpoint: "1",
          },
          changes: [...messages.values()],
          requiredHydration: [],
          roundComplete: true,
        },
      };
    },
    async hydrate() {
      return {
        status: "ok",
        value: { changes: [], bodies: [], unresolved: [] },
      };
    },
    async readConversationMembership({ conversation }) {
      const keys = [...messages.values()]
        .filter(
          (
            change,
          ): change is Extract<ProviderChange, { kind: "message_patch" }> =>
            change.kind === "message_patch" &&
            change.reference.conversationId === conversation.conversationId,
        )
        .map((change) => change.key);
      return {
        status: "ok",
        value: {
          status: "page",
          page: {
            conversation,
            resolutionId: "res",
            keys,
            changes: [],
            nextPage: null,
            evidence: null,
          },
        },
      };
    },
    async search() {
      return { status: "unsupported" };
    },
    async readAttachment() {
      return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
    },
  };
}
