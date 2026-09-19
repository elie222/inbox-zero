import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import {
  createMailEngine,
  createHostRuntime,
} from "@inboxzero/mail-core/engine";
import { OFFLINE_DISPATCH_HOLD_MS } from "@inboxzero/mail-core/operations";
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
import { clampMaxPendingOperations, createSqliteMailStore } from "./store";

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
    expect(pending.view.conversations[0]?.to).toBe("me@example.com");
    expect(pending.view.conversations[0]?.senders).toEqual(["ada@example.com"]);

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
            bodies: [],
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

  it("records blocked_auth then recovers, and idle catch-up applies missed and duplicate hints", async () => {
    const messages = new Map([
      ["m1", messagePatch("m1", "c1", 1000, ["inbox"])],
      ["m2", messagePatch("m2", "c2", 2000, ["inbox"])],
    ]);
    let changeStatus: "blocked_auth" | "page" = "blocked_auth";
    const source = fixtureSource(messages);
    const gated: MailboxSource = {
      ...source,
      async readChanges(input) {
        if (changeStatus === "blocked_auth") {
          return { status: "blocked_auth" };
        }
        return source.readChanges(input);
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
        requestId: "boot",
        from: { streamId: "primary", generation: "g1", checkpoint: null },
        to: { streamId: "primary", generation: "g1", checkpoint: "1" },
        changes: [...messages.values()],
        requiredHydration: [],
        roundComplete: true,
      },
    });
    const engine = createMailEngine({
      store,
      source: gated,
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
    expect((await engine.getDiagnostics("acc-1")).connection).toBe(
      "blocked_auth",
    );
    expect((await store.readMailboxView(inboxQuery)).view.connection).toBe(
      "blocked_auth",
    );

    changeStatus = "page";
    await engine.runUntil(Date.now() + 2000);
    expect((await engine.getDiagnostics("acc-1")).connection).toBe("ready");
    expect(
      (await store.readMailboxView(inboxQuery)).view.counts
        .matchingConversations,
    ).toBe(2);

    messages.set("m1", messagePatch("m1", "c1", 1000, []));
    await engine.runUntil(Date.now() + 2000);
    expect(
      (await store.readMailboxView(inboxQuery)).view.counts
        .matchingConversations,
    ).toBe(1);
    await engine.runUntil(Date.now() + 2000);
    const inspection = await store.inspect();
    expect(inspection.accounts[0]?.connection).toBe("ready");
    expect(
      (await store.readMailboxView(inboxQuery)).view.counts
        .matchingConversations,
    ).toBe(1);
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
    expect(
      await store.readDraft({ accountId: "acc-1", draftId: "d1" }),
    ).toMatchObject({
      status: "found",
      draftRevision: saved.draftRevision,
      content: { subject: "Hi" },
    });
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

  it("unfreezes a draft when a queued send is cancelled", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const saved = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d-undo" },
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
      commandId: "send-undo",
      draft: { accountId: "acc-1", draftId: "d-undo" },
      draftRevision: saved.draftRevision,
      replyTo: null,
    });
    expect(send.status).toBe("queued");
    expect(
      (
        await store.saveDraft({
          key: { accountId: "acc-1", draftId: "d-undo" },
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
        })
      ).status,
    ).toBe("conflict");
    const cancelled = await store.cancelOperation({
      accountId: "acc-1",
      operationId: "send-undo",
    });
    expect(cancelled.status).toBe("cancelled");
    const edited = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d-undo" },
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
    expect(edited.status).toBe("saved");
    expect(
      await store.readDraft({ accountId: "acc-1", draftId: "d-undo" }),
    ).toMatchObject({
      status: "found",
      content: { subject: "Hi later" },
    });
    await store.close();
  });

  it("rejects a second send while the draft is frozen and unfreezes after fail", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const saved = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d-fail" },
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
      commandId: "send-fail",
      draft: { accountId: "acc-1", draftId: "d-fail" },
      draftRevision: saved.draftRevision,
      replyTo: null,
    });
    expect(send.status).toBe("queued");
    expect(
      await store.admitSend({
        commandId: "send-fail",
        draft: { accountId: "acc-1", draftId: "d-fail" },
        draftRevision: saved.draftRevision,
        replyTo: null,
      }),
    ).toMatchObject({ status: "already_recorded" });
    expect(
      await store.admitSend({
        commandId: "send-fail-again",
        draft: { accountId: "acc-1", draftId: "d-fail" },
        draftRevision: saved.draftRevision,
        replyTo: null,
      }),
    ).toEqual({ status: "rejected", code: "invalid" });
    expect(
      (
        await store.saveDraft({
          key: { accountId: "acc-1", draftId: "d-fail" },
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
        })
      ).status,
    ).toBe("conflict");
    expect(
      (
        await store.failOperation(
          { accountId: "acc-1", operationId: "send-fail" },
          "provider_error",
        )
      ).status,
    ).toBe("committed");
    const edited = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d-fail" },
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
    expect(edited.status).toBe("saved");
    if (edited.status !== "saved") throw new Error("expected save");
    expect(
      (
        await store.admitSend({
          commandId: "send-fail-again",
          draft: { accountId: "acc-1", draftId: "d-fail" },
          draftRevision: edited.draftRevision,
          replyTo: null,
        })
      ).status,
    ).toBe("queued");
    await store.close();
  });

  it("unfreezes a draft when a send is rejected", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const saved = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d-reject" },
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
    expect(
      (
        await store.admitSend({
          commandId: "send-reject",
          draft: { accountId: "acc-1", draftId: "d-reject" },
          draftRevision: saved.draftRevision,
          replyTo: null,
        })
      ).status,
    ).toBe("queued");
    const work = await store.claimWork({
      ownerId: "owner",
      nowMs: Date.now(),
      leaseMs: 30_000,
    });
    expect(work?.kind).toBe("command");
    if (work?.kind !== "command") throw new Error("expected command");
    expect(
      (
        await store.settleAttempt({
          attemptId: work.attemptId,
          operation: work.operation,
          result: { status: "rejected", code: "invalid", targets: [] },
        })
      ).status,
    ).toBe("committed");
    const edited = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d-reject" },
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
    expect(edited.status).toBe("saved");
    await store.close();
  });

  it("keeps a draft frozen after an uncertain or confirmed send", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const uncertainDraft = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d-uncertain" },
      expectedRevision: null,
      content: {
        to: ["ada@example.com"],
        cc: [],
        bcc: [],
        subject: "Uncertain",
        editableHtml: "<p>Uncertain</p>",
        quotedHtml: "",
        attachmentIds: [],
      },
    });
    const confirmedDraft = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d-confirmed" },
      expectedRevision: null,
      content: {
        to: ["ada@example.com"],
        cc: [],
        bcc: [],
        subject: "Confirmed",
        editableHtml: "<p>Confirmed</p>",
        quotedHtml: "",
        attachmentIds: [],
      },
    });
    expect(uncertainDraft.status).toBe("saved");
    expect(confirmedDraft.status).toBe("saved");
    if (
      uncertainDraft.status !== "saved" ||
      confirmedDraft.status !== "saved"
    ) {
      throw new Error("expected save");
    }
    expect(
      (
        await store.admitSend({
          commandId: "send-uncertain",
          draft: { accountId: "acc-1", draftId: "d-uncertain" },
          draftRevision: uncertainDraft.draftRevision,
          replyTo: null,
        })
      ).status,
    ).toBe("queued");
    const uncertainWork = await store.claimWork({
      ownerId: "owner",
      nowMs: Date.now(),
      leaseMs: 30_000,
    });
    expect(uncertainWork?.kind).toBe("command");
    if (uncertainWork?.kind !== "command") throw new Error("expected command");
    expect(uncertainWork.operation.key.operationId).toBe("send-uncertain");
    await store.settleAttempt({
      attemptId: uncertainWork.attemptId,
      operation: uncertainWork.operation,
      result: { status: "uncertain", receiptId: "r-lost" },
    });
    expect(
      (
        await store.admitSend({
          commandId: "send-confirmed",
          draft: { accountId: "acc-1", draftId: "d-confirmed" },
          draftRevision: confirmedDraft.draftRevision,
          replyTo: null,
        })
      ).status,
    ).toBe("queued");
    const confirmedWork = await store.claimWork({
      ownerId: "owner",
      nowMs: Date.now(),
      leaseMs: 30_000,
    });
    expect(confirmedWork?.kind).toBe("command");
    if (confirmedWork?.kind !== "command") throw new Error("expected command");
    expect(confirmedWork.operation.key.operationId).toBe("send-confirmed");
    await store.settleAttempt({
      attemptId: confirmedWork.attemptId,
      operation: confirmedWork.operation,
      result: {
        status: "confirmed",
        receiptId: "r-sent",
        observations: [],
        targets: [],
      },
    });
    expect(
      (
        await store.saveDraft({
          key: { accountId: "acc-1", draftId: "d-uncertain" },
          expectedRevision: uncertainDraft.draftRevision,
          content: {
            to: ["ada@example.com"],
            cc: [],
            bcc: [],
            subject: "Uncertain later",
            editableHtml: "<p>Later</p>",
            quotedHtml: "",
            attachmentIds: [],
          },
        })
      ).status,
    ).toBe("conflict");
    expect(
      (
        await store.saveDraft({
          key: { accountId: "acc-1", draftId: "d-confirmed" },
          expectedRevision: confirmedDraft.draftRevision,
          content: {
            to: ["ada@example.com"],
            cc: [],
            bcc: [],
            subject: "Confirmed later",
            editableHtml: "<p>Later</p>",
            quotedHtml: "",
            attachmentIds: [],
          },
        })
      ).status,
    ).toBe("conflict");
    expect(
      await store.admitSend({
        commandId: "send-uncertain-again",
        draft: { accountId: "acc-1", draftId: "d-uncertain" },
        draftRevision: uncertainDraft.draftRevision,
        replyTo: null,
      }),
    ).toEqual({ status: "rejected", code: "invalid" });
    expect(
      await store.admitSend({
        commandId: "send-confirmed-again",
        draft: { accountId: "acc-1", draftId: "d-confirmed" },
        draftRevision: confirmedDraft.draftRevision,
        replyTo: null,
      }),
    ).toEqual({ status: "rejected", code: "invalid" });
    await store.close();
  });

  it("freezes the provider draft id into the send command", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const saved = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d-provider" },
      expectedRevision: null,
      content: {
        to: ["ada@example.com"],
        cc: [],
        bcc: [],
        subject: "Hi",
        editableHtml: "<p>Hi</p>",
        quotedHtml: "",
        attachmentIds: [],
        providerDraftId: "gmail-draft-1",
      },
    });
    expect(saved.status).toBe("saved");
    if (saved.status !== "saved") throw new Error("expected save");
    const send = await store.admitSend({
      commandId: "send-provider",
      draft: { accountId: "acc-1", draftId: "d-provider" },
      draftRevision: saved.draftRevision,
      replyTo: null,
    });
    expect(send.status).toBe("queued");
    const work = await store.claimWork({
      ownerId: "owner",
      nowMs: Date.now(),
      leaseMs: 30_000,
    });
    expect(work?.kind).toBe("command");
    if (work?.kind !== "command") throw new Error("expected command");
    expect(work.operation.intent.kind).toBe("send");
    if (work.operation.intent.kind === "send") {
      expect(work.operation.intent.providerDraftId).toBe("gmail-draft-1");
    }
    await store.close();
  });

  it("tombstones local messages that a completed bootstrap did not see", async () => {
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
          messagePatch("kept", "c-kept", 1000, ["inbox"]),
          messagePatch("gone", "c-gone", 2000, ["draft"]),
        ],
        requiredHydration: [],
        roundComplete: true,
      },
    });
    await store.tombstoneUnseen({
      accountId: "acc-1",
      seenMessageIds: ["kept"],
    });
    const inspection = await store.inspect();
    expect(
      inspection.messages.find((row) => row.messageId === "kept")?.deleted,
    ).toBe(false);
    expect(
      inspection.messages.find((row) => row.messageId === "gone")?.deleted,
    ).toBe(true);
    await store.close();
  });

  it("holds a send until notBeforeMs and records the conversation on diagnostics", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const saved = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d-hold" },
      expectedRevision: null,
      content: {
        to: ["ada@example.com"],
        cc: [],
        bcc: [],
        subject: "Hold",
        editableHtml: "<p>Hold</p>",
        quotedHtml: "",
        attachmentIds: [],
      },
    });
    expect(saved.status).toBe("saved");
    if (saved.status !== "saved") throw new Error("expected save");
    const notBeforeMs = Date.now() + 5000;
    const send = await store.admitSend({
      commandId: "send-hold",
      conversationId: "thread-hold",
      draft: { accountId: "acc-1", draftId: "d-hold" },
      draftRevision: saved.draftRevision,
      notBeforeMs,
      replyTo: null,
    });
    expect(send.status).toBe("queued");
    expect(
      await store.claimWork({
        ownerId: "owner",
        nowMs: notBeforeMs - 1,
        leaseMs: 30_000,
      }),
    ).toBeNull();
    const work = await store.claimWork({
      ownerId: "owner",
      nowMs: notBeforeMs,
      leaseMs: 30_000,
    });
    expect(work?.kind).toBe("command");
    const replay = await store.admitSend({
      commandId: "send-hold",
      conversationId: "thread-hold",
      draft: { accountId: "acc-1", draftId: "d-hold" },
      draftRevision: saved.draftRevision,
      replyTo: null,
    });
    expect(replay.status).toBe("already_recorded");
    const diagnostics = await store.getDiagnostics("acc-1");
    expect(
      diagnostics.commands.find(
        (command) => command.operationId === "send-hold",
      )?.conversationIds,
    ).toEqual(["thread-hold"]);
    await store.close();
  });

  it("releases connectivity holds without clearing undo holds", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const offlineDraft = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d-offline" },
      expectedRevision: null,
      content: {
        to: ["ada@example.com"],
        cc: [],
        bcc: [],
        subject: "Offline",
        editableHtml: "<p>Offline</p>",
        quotedHtml: "",
        attachmentIds: [],
      },
    });
    const undoDraft = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d-undo" },
      expectedRevision: null,
      content: {
        to: ["ada@example.com"],
        cc: [],
        bcc: [],
        subject: "Undo",
        editableHtml: "<p>Undo</p>",
        quotedHtml: "",
        attachmentIds: [],
      },
    });
    expect(offlineDraft.status).toBe("saved");
    expect(undoDraft.status).toBe("saved");
    if (offlineDraft.status !== "saved" || undoDraft.status !== "saved") {
      throw new Error("expected save");
    }
    const nowMs = Date.now();
    expect(
      (
        await store.admitSend({
          commandId: "send-offline",
          conversationId: "thread-offline",
          draft: { accountId: "acc-1", draftId: "d-offline" },
          draftRevision: offlineDraft.draftRevision,
          notBeforeMs: nowMs + OFFLINE_DISPATCH_HOLD_MS,
          replyTo: null,
        })
      ).status,
    ).toBe("queued");
    expect(
      (
        await store.admitSend({
          commandId: "send-undo",
          conversationId: "thread-undo",
          draft: { accountId: "acc-1", draftId: "d-undo" },
          draftRevision: undoDraft.draftRevision,
          notBeforeMs: nowMs + 5000,
          replyTo: null,
        })
      ).status,
    ).toBe("queued");
    expect(
      await store.claimWork({
        ownerId: "owner",
        nowMs,
        leaseMs: 30_000,
      }),
    ).toBeNull();
    await store.releaseDeferredOperations({
      accountIds: ["acc-1"],
      nowMs,
    });
    const work = await store.claimWork({
      ownerId: "owner",
      nowMs,
      leaseMs: 30_000,
    });
    expect(work?.kind).toBe("command");
    if (work?.kind !== "command") throw new Error("expected command");
    expect(work.operation.key.operationId).toBe("send-offline");
    expect(
      await store.claimWork({
        ownerId: "owner",
        nowMs: nowMs + 5000 - 1,
        leaseMs: 30_000,
      }),
    ).toBeNull();
    await store.close();
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

  it("stores enumerated bodies so conversation content is available without hydrate", async () => {
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
        changes: [messagePatch("m1", "c1", 1000, ["draft"])],
        requiredHydration: [],
        roundComplete: true,
      },
      bodies: [
        {
          key: { accountId: "acc-1", messageId: "m1" },
          version: "1",
          html: "<p>First saved reply</p>",
          text: "First saved reply",
          attachments: [
            {
              attachmentId: "att-1",
              filename: "reader-preview.png",
              mimeType: "image/png",
              size: 12,
              inline: false,
            },
          ],
          isMeetingInvitation: true,
        },
      ],
    });
    const conversation = await store.readConversation(
      { accountId: "acc-1", conversationId: "c1" },
      { after: null, pageSize: 10 },
    );
    expect(conversation.view.messages[0]?.content).toEqual({
      status: "available",
      html: "<p>First saved reply</p>",
      text: "First saved reply",
      attachments: [
        {
          attachmentId: "att-1",
          filename: "reader-preview.png",
          mimeType: "image/png",
          size: 12,
          inline: false,
        },
      ],
      isMeetingInvitation: true,
    });
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

describe("quota, retention, and recovery", () => {
  it("clamps requested pending-operation caps to the store maximum", () => {
    expect(clampMaxPendingOperations(1)).toBe(1);
    expect(clampMaxPendingOperations(5000)).toBe(5000);
    expect(clampMaxPendingOperations(50_000)).toBe(5000);
    expect(clampMaxPendingOperations(Number.POSITIVE_INFINITY)).toBe(5000);
    expect(clampMaxPendingOperations(0)).toBe(5000);
    expect(clampMaxPendingOperations(undefined)).toBe(5000);
    expect(clampMaxPendingOperations(Number.NaN)).toBe(5000);
  });

  it("rejects new commands once the pending queue is full", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver(), {
      maxPendingOperations: 1,
    });
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
    const first = await store.admitMetadata({
      accountId: "acc-1",
      commandId: "archive-1",
      targets: [{ accountId: "acc-1", messageId: "m1" }],
      change: { kind: "archive" },
    });
    expect(first.status).toBe("queued");
    const second = await store.admitMetadata({
      accountId: "acc-1",
      commandId: "archive-2",
      targets: [{ accountId: "acc-1", messageId: "m2" }],
      change: { kind: "archive" },
    });
    expect(second).toEqual({ status: "rejected", code: "queue_full" });
    const retry = await store.admitMetadata({
      accountId: "acc-1",
      commandId: "archive-1",
      targets: [{ accountId: "acc-1", messageId: "m1" }],
      change: { kind: "archive" },
    });
    expect(retry.status).toBe("already_recorded");
    await store.close();
  });

  it("counts preparing conversation commands toward the queue cap", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver(), {
      maxPendingOperations: 1,
    });
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
    const preparing = await store.admitConversations({
      accountId: "acc-1",
      commandId: "archive-thread",
      conversations: [{ accountId: "acc-1", conversationId: "c1" }],
      change: { kind: "archive" },
      observedRevision: revision,
    });
    expect(preparing.status).toBe("preparing");
    const blocked = await store.admitMetadata({
      accountId: "acc-1",
      commandId: "archive-later",
      targets: [{ accountId: "acc-1", messageId: "m1" }],
      change: { kind: "archive" },
    });
    expect(blocked).toEqual({ status: "rejected", code: "queue_full" });
    await store.close();
  });

  it("does not freeze a draft when send admission is queue_full", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver(), {
      maxPendingOperations: 1,
    });
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
      commandId: "archive-1",
      targets: [{ accountId: "acc-1", messageId: "m1" }],
      change: { kind: "archive" },
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
    expect(send).toEqual({ status: "rejected", code: "queue_full" });
    const edited = await store.saveDraft({
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
    expect(edited.status).toBe("saved");
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

  it("lists and counts 100k conversations under the local query budget", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    for (let batch = 0; batch < 10; batch += 1) {
      const changes = Array.from({ length: 10_000 }, (_, index) => {
        const id = batch * 10_000 + index;
        return messagePatch(`m${id}`, `c${id}`, id, ["inbox"]);
      });
      await store.applySyncPage({
        ownerId: "owner",
        page: {
          session: { accountId: "acc-1", generation: "g1" },
          requestId: `scale-100k-${batch}`,
          from: {
            streamId: "primary",
            generation: "g1",
            checkpoint: batch === 0 ? null : String(batch),
          },
          to: {
            streamId: "primary",
            generation: "g1",
            checkpoint: String(batch + 1),
          },
          changes,
          requiredHydration: [],
          roundComplete: batch === 9,
        },
      });
    }
    const started = Date.now();
    const view = await store.readMailboxView(inboxQuery);
    const elapsedMs = Date.now() - started;
    expect(view.view.counts.matchingConversations).toBe(100_000);
    expect(view.view.conversations).toHaveLength(25);
    expect(elapsedMs).toBeLessThan(5000);
    await store.close();
  }, 120_000);

  it("lists and counts 1M conversations in batched pages", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    for (let batch = 0; batch < 100; batch += 1) {
      const changes = Array.from({ length: 10_000 }, (_, index) => {
        const id = batch * 10_000 + index;
        return messagePatch(`m${id}`, `c${id}`, id, ["inbox"]);
      });
      await store.applySyncPage({
        ownerId: "owner",
        page: {
          session: { accountId: "acc-1", generation: "g1" },
          requestId: `scale-1m-${batch}`,
          from: {
            streamId: "primary",
            generation: "g1",
            checkpoint: batch === 0 ? null : String(batch),
          },
          to: {
            streamId: "primary",
            generation: "g1",
            checkpoint: String(batch + 1),
          },
          changes,
          requiredHydration: [],
          roundComplete: batch === 99,
        },
      });
    }
    const started = Date.now();
    const view = await store.readMailboxView(inboxQuery);
    const elapsedMs = Date.now() - started;
    expect(view.view.counts.matchingConversations).toBe(1_000_000);
    expect(view.view.conversations).toHaveLength(25);
    expect(elapsedMs).toBeLessThan(5000);
    await store.close();
  }, 600_000);
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
          bodies: [],
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
