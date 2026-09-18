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
    expect(work.operation.intent.kind).toBe("send");
    if (work.operation.intent.kind === "send") {
      expect(work.operation.intent.frozenDraftId).toBe("d1");
      expect(work.operation.intent.to).toEqual(["ada@example.com"]);
      expect(work.operation.intent.html).toBe("<p>Hi</p>");
    }
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

describe("per-target outcomes, dependencies, pagination, and stale hydration", () => {
  it("keeps applied and rejected bulk targets independently", async () => {
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
        changes: [
          messagePatch("m1", "c1", 1000, ["inbox"]),
          messagePatch("m2", "c2", 2000, ["inbox"]),
        ],
        requiredHydration: [],
        roundComplete: true,
      },
    });
    await store.admitMetadata({
      accountId: "acc-1",
      commandId: "bulk-archive",
      targets: [
        { accountId: "acc-1", messageId: "m1" },
        { accountId: "acc-1", messageId: "m2" },
      ],
      change: { kind: "archive" },
    });
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
      result: {
        status: "confirmed",
        receiptId: "partial",
        observations: [],
        targets: [
          {
            key: { accountId: "acc-1", messageId: "m1" },
            outcome: "applied",
            code: null,
          },
          {
            key: { accountId: "acc-1", messageId: "m2" },
            outcome: "rejected",
            code: "not_found",
          },
        ],
      },
    });
    const inspection = await store.inspect();
    expect(
      inspection.operations.find(
        (item) => item.key.operationId === "bulk-archive",
      )?.status,
    ).toBe("needs_attention");
    const m1 = inspection.messages.find((item) => item.messageId === "m1");
    const m2 = inspection.messages.find((item) => item.messageId === "m2");
    expect(m1?.confirmed.roles.includes("inbox")).toBe(false);
    expect(m2?.confirmed.roles.includes("inbox")).toBe(true);
    expect(
      inspection.operationTargets
        .filter((target) => target.operationId === "bulk-archive")
        .map((target) => `${target.messageId}:${target.outcome}`)
        .sort(),
    ).toEqual(["m1:applied", "m2:rejected"]);
    await store.close();
  });

  it("does not claim a later overlapping command until the earlier one settles", async () => {
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
    await store.admitMetadata({
      accountId: "acc-1",
      commandId: "star-first",
      targets: [{ accountId: "acc-1", messageId: "m1" }],
      change: { kind: "set_starred", starred: true },
    });
    await store.admitMetadata({
      accountId: "acc-1",
      commandId: "archive-second",
      targets: [{ accountId: "acc-1", messageId: "m1" }],
      change: { kind: "archive" },
    });
    const first = await store.claimWork({
      ownerId: "owner",
      nowMs: Date.now(),
      leaseMs: 30_000,
    });
    expect(first?.kind).toBe("command");
    if (first?.kind !== "command") throw new Error("expected command");
    expect(first.operation.key.operationId).toBe("star-first");
    const blocked = await store.claimWork({
      ownerId: "owner",
      nowMs: Date.now(),
      leaseMs: 30_000,
    });
    expect(blocked).toBeNull();
    await store.settleAttempt({
      attemptId: first.attemptId,
      operation: first.operation,
      result: {
        status: "confirmed",
        receiptId: "starred",
        observations: [],
        targets: [
          {
            key: { accountId: "acc-1", messageId: "m1" },
            outcome: "applied",
            code: null,
          },
        ],
      },
    });
    const second = await store.claimWork({
      ownerId: "owner",
      nowMs: Date.now(),
      leaseMs: 30_000,
    });
    expect(second?.kind).toBe("command");
    if (second?.kind !== "command") throw new Error("expected command");
    expect(second.operation.key.operationId).toBe("archive-second");
    await store.close();
  });

  it("pages conversation membership before freezing targets", async () => {
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
      commandId: "archive-pages",
      conversations: [{ accountId: "acc-1", conversationId: "c1" }],
      change: { kind: "archive" },
      observedRevision: revision,
    });
    expect(admission.status).toBe("preparing");
    const firstPage = await store.applyPreparationPage({
      accountId: "acc-1",
      commandId: "archive-pages",
      page: {
        conversation: { accountId: "acc-1", conversationId: "c1" },
        resolutionId: "res-pages",
        keys: [{ accountId: "acc-1", messageId: "m1" }],
        changes: [],
        nextPage: "1",
        evidence: null,
      },
    });
    expect(firstPage.status).toBe("preparing");
    const tooSoon = await store.finishPreparation({
      accountId: "acc-1",
      commandId: "archive-pages",
    });
    expect(tooSoon.status).toBe("stale");
    const secondPage = await store.applyPreparationPage({
      accountId: "acc-1",
      commandId: "archive-pages",
      page: {
        conversation: { accountId: "acc-1", conversationId: "c1" },
        resolutionId: "res-pages",
        keys: [{ accountId: "acc-1", messageId: "m2" }],
        changes: [messagePatch("m2", "c1", 1500, ["inbox"])],
        nextPage: null,
        evidence: null,
      },
    });
    expect(secondPage.status).toBe("preparing");
    const frozen = await store.finishPreparation({
      accountId: "acc-1",
      commandId: "archive-pages",
    });
    expect(frozen.status).toBe("queued");
    const inspection = await store.inspect();
    expect(
      inspection.operationTargets
        .filter((target) => target.operationId === "archive-pages")
        .map((target) => target.messageId)
        .sort(),
    ).toEqual(["m1", "m2"]);
    await store.close();
  });

  it("rejects a stale hydration body that is older than the committed version", async () => {
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
    const freshPatch = messagePatch("m1", "c1", 1000, ["inbox"]);
    const fresh = await store.applyHydration({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "body-2",
      changes: [
        {
          ...freshPatch,
          reference: {
            provider: "google",
            messageId: "m1",
            conversationId: "c1",
            version: "2",
          },
          fields: { ...freshPatch.fields, preview: "new" },
        },
      ],
      bodies: [
        {
          key: { accountId: "acc-1", messageId: "m1" },
          version: "2",
          html: "<p>new</p>",
          text: "new",
        },
      ],
    });
    expect(fresh.status).toBe("committed");
    const stale = await store.applyHydration({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "body-1",
      changes: [
        {
          ...freshPatch,
          reference: {
            provider: "google",
            messageId: "m1",
            conversationId: "c1",
            version: "1",
          },
          fields: { ...freshPatch.fields, preview: "old" },
        },
      ],
      bodies: [
        {
          key: { accountId: "acc-1", messageId: "m1" },
          version: "1",
          html: "<p>old</p>",
          text: "old",
        },
      ],
    });
    expect(stale.status).toBe("stale");
    const conversation = await store.readConversation(
      { accountId: "acc-1", conversationId: "c1" },
      { after: null, pageSize: 10 },
    );
    expect(conversation.view.messages[0]?.metadata.preview).toBe("new");
    await store.close();
  });

  it("applies assistant archive catch-up without replacing a newer local draft", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
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
        subject: "Local",
        editableHtml: "<p>Local</p>",
        quotedHtml: "",
        attachmentIds: [],
      },
    });
    expect(saved.status).toBe("saved");
    await store.applyAssistantEntries({
      accountId: "acc-1",
      cursor: "a2",
      entries: [
        {
          cursor: "a1",
          draftId: "d1",
          draftRevision: 0,
        },
        {
          cursor: "a2",
          change: messagePatch("m9", "c9", 4000, ["inbox"]),
        },
      ],
    });
    const inspection = await store.inspect();
    expect(inspection.accounts[0]?.assistantCursor).toBe("a2");
    expect(inspection.messages.some((item) => item.messageId === "m9")).toBe(
      true,
    );
    const later = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d1" },
      expectedRevision: 1,
      content: {
        to: ["ada@example.com"],
        cc: [],
        bcc: [],
        subject: "Still local",
        editableHtml: "<p>Still local</p>",
        quotedHtml: "",
        attachmentIds: [],
      },
    });
    expect(later.status).toBe("saved");
    await store.close();
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

describe("sqlite scale smoke", () => {
  it("lists and counts a 10k-conversation mailbox", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const changes = Array.from({ length: 10_000 }, (_, index) =>
      messagePatch(`m${index}`, `c${index}`, index, ["inbox"]),
    );
    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "scale",
        from: { streamId: "primary", generation: "g1", checkpoint: null },
        to: { streamId: "primary", generation: "g1", checkpoint: "10k" },
        changes,
        requiredHydration: [],
        roundComplete: true,
      },
    });
    const started = Date.now();
    const view = await store.readMailboxView(inboxQuery);
    const elapsedMs = Date.now() - started;
    expect(view.view.counts.matchingConversations).toBe(10_000);
    expect(view.view.conversations).toHaveLength(25);
    expect(elapsedMs).toBeLessThan(5000);
    await store.close();
  });
});

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
