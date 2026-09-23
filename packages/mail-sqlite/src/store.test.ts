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
import type {
  ClaimedWork,
  MailStore,
} from "@inboxzero/mail-core/ports/mail-store";
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

  it("persists provider external URLs through reader conversation projection", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-sqlite-"));
    const path = join(directory, "mailbox.sqlite");
    const store = await createSqliteMailStore(createNodeSqliteDriver(path));
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "microsoft",
      generation: "g1",
    });
    const patch = messagePatch("m1", "c1", 1000, ["inbox"]);
    const externalUrl = "https://outlook.office.com/mail/deeplink/read/m1";
    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "external-url",
        from: { streamId: "inbox", generation: "g1", checkpoint: null },
        to: { streamId: "inbox", generation: "g1", checkpoint: "1" },
        changes: [
          {
            ...patch,
            reference: { ...patch.reference, provider: "microsoft" },
            fields: { ...patch.fields, externalUrl },
          },
        ],
        requiredHydration: [],
        roundComplete: true,
      },
    });

    await store.close();

    const reopened = await createSqliteMailStore(createNodeSqliteDriver(path));
    const conversation = await reopened.readConversation(
      { accountId: "acc-1", conversationId: "c1" },
      { pageSize: 10, after: null },
    );
    expect(conversation.view.messages[0]?.metadata.externalUrl).toBe(
      externalUrl,
    );
    await reopened.close();
    await rm(directory, { recursive: true, force: true });
  });

  it("filters Outlook focused and other inbox sections from canonical metadata", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "microsoft",
      generation: "g1",
    });

    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "focused-other",
        from: { streamId: "inbox", generation: "g1", checkpoint: null },
        to: { streamId: "inbox", generation: "g1", checkpoint: "1" },
        changes: [
          messagePatch("m1", "focused-c", 1000, ["inbox"], {
            provider: "microsoft",
            inboxSection: "focused",
          }),
          messagePatch("m2", "other-c", 2000, ["inbox"], {
            provider: "microsoft",
            inboxSection: "other",
          }),
          messagePatch("m3", "unclassified-c", 3000, ["inbox"], {
            provider: "microsoft",
          }),
        ],
        requiredHydration: [],
        roundComplete: true,
      },
    });

    const focused = await store.readMailboxView({
      ...inboxQuery,
      predicate: {
        kind: "all",
        predicates: [
          { kind: "role", role: "inbox" },
          { kind: "inbox_section", section: "focused" },
        ],
      },
    });
    expect(
      focused.view.conversations.map((row) => row.key.conversationId),
    ).toEqual(["focused-c"]);

    const other = await store.readMailboxView({
      ...inboxQuery,
      predicate: {
        kind: "all",
        predicates: [
          { kind: "role", role: "inbox" },
          { kind: "inbox_section", section: "other" },
        ],
      },
    });
    expect(
      other.view.conversations.map((row) => row.key.conversationId),
    ).toEqual(["other-c"]);

    const plainInbox = await store.readMailboxView(inboxQuery);
    expect(plainInbox.view.counts.matchingConversations).toBe(3);
    await store.close();
  });

  it("upgrades existing mailbox rows before storing provider external URLs", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-sqlite-"));
    const path = join(directory, "mailbox.sqlite");
    createLegacyMailboxWithoutExternalUrl(path);

    const store = await createSqliteMailStore(createNodeSqliteDriver(path));
    let inspection = await store.inspect({ accountIds: ["acc-1"] });
    expect(inspection.messages[0]?.confirmed.subject).toBe("Legacy subject");
    expect(inspection.messages[0]?.confirmed.externalUrl).toBeUndefined();

    const patch = messagePatch("m1", "c1", 1000, ["inbox"]);
    const externalUrl = "https://outlook.office.com/mail/deeplink/read/m1";
    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "external-url-upgrade",
        from: { streamId: "inbox", generation: "g1", checkpoint: null },
        to: { streamId: "inbox", generation: "g1", checkpoint: "1" },
        changes: [
          {
            ...patch,
            reference: { ...patch.reference, provider: "microsoft" },
            fields: { ...patch.fields, externalUrl },
          },
        ],
        requiredHydration: [],
        roundComplete: true,
      },
    });

    inspection = await store.inspect({ accountIds: ["acc-1"] });
    expect(inspection.messages[0]?.confirmed.externalUrl).toBe(externalUrl);
    expect(inspection.messages[0]?.effective.externalUrl).toBe(externalUrl);
    await store.close();
    await rm(directory, { recursive: true, force: true });
  });

  it("rejects stale sync pages that do not start from the stored checkpoint", async () => {
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
        requestId: "first",
        from: { streamId: "primary", generation: "g1", checkpoint: null },
        to: { streamId: "primary", generation: "g1", checkpoint: "1" },
        changes: [messagePatch("m1", "c1", 1000, ["inbox"])],
        requiredHydration: [],
        roundComplete: true,
      },
    });
    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "second",
        from: { streamId: "primary", generation: "g1", checkpoint: "1" },
        to: { streamId: "primary", generation: "g1", checkpoint: "2" },
        changes: [messagePatch("m2", "c2", 2000, ["inbox"])],
        requiredHydration: [],
        roundComplete: true,
      },
    });
    const stale = await store.applySyncPage({
      ownerId: "owner",
      page: {
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "stale",
        from: { streamId: "primary", generation: "g1", checkpoint: "1" },
        to: { streamId: "primary", generation: "g1", checkpoint: "stale" },
        changes: [messagePatch("m3", "c3", 3000, ["inbox"])],
        requiredHydration: [],
        roundComplete: true,
      },
    });
    expect(stale.status).toBe("stale");
    const inspection = await store.inspect();
    expect(inspection.streams[0]?.checkpoint).toBe("2");
    expect(
      inspection.messages.some((message) => message.messageId === "m3"),
    ).toBe(false);
    await store.close();
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
    let now = 1000;
    const deadline = () => now + 2000;
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
      runtime: createHostRuntime({ nowMs: () => now }),
    });
    await engine.requestSync(["acc-1"]);
    await engine.runUntil(deadline());
    expect((await engine.getDiagnostics("acc-1")).connection).toBe(
      "blocked_auth",
    );
    expect((await store.readMailboxView(inboxQuery)).view.connection).toBe(
      "blocked_auth",
    );

    changeStatus = "page";
    now += 60_000;
    await engine.runUntil(deadline());
    expect((await engine.getDiagnostics("acc-1")).connection).toBe("ready");
    expect(
      (await store.readMailboxView(inboxQuery)).view.counts
        .matchingConversations,
    ).toBe(2);

    messages.set("m1", messagePatch("m1", "c1", 1000, []));
    now += 60_000;
    await engine.runUntil(deadline());
    expect(
      (await store.readMailboxView(inboxQuery)).view.counts
        .matchingConversations,
    ).toBe(1);
    now += 60_000;
    await engine.runUntil(deadline());
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
      await store.admitSend({
        commandId: "send-fail",
        draft: { accountId: "acc-1", draftId: "d-fail" },
        draftRevision: edited.draftRevision,
        replyTo: null,
      }),
    ).toEqual({ status: "rejected", code: "invalid" });
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

  it("ignores a late confirmed settle after the send has failed", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const saved = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d-late" },
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
          commandId: "send-late",
          draft: { accountId: "acc-1", draftId: "d-late" },
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
        await store.failOperation(
          { accountId: "acc-1", operationId: "send-late" },
          "provider_error",
        )
      ).status,
    ).toBe("committed");
    const edited = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d-late" },
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
      await store.settleAttempt({
        attemptId: work.attemptId,
        operation: work.operation,
        result: {
          status: "confirmed",
          receiptId: "r-late",
          observations: [],
          targets: [],
        },
      }),
    ).toEqual({ status: "stale" });
    expect(
      await store.readOperation({
        accountId: "acc-1",
        operationId: "send-late",
      }),
    ).toMatchObject({ operation: { status: "failed" } });
    expect(
      await store.readDraft({ accountId: "acc-1", draftId: "d-late" }),
    ).toMatchObject({
      status: "found",
      content: { subject: "Hi later" },
    });
    expect(
      (
        await store.admitSend({
          commandId: "send-late-again",
          draft: { accountId: "acc-1", draftId: "d-late" },
          draftRevision: edited.draftRevision,
          replyTo: null,
        })
      ).status,
    ).toBe("queued");
    expect(
      await store.settleAttempt({
        attemptId: work.attemptId,
        operation: work.operation,
        result: { status: "rejected", code: "invalid", targets: [] },
      }),
    ).toEqual({ status: "stale" });
    expect(
      (
        await store.saveDraft({
          key: { accountId: "acc-1", draftId: "d-late" },
          expectedRevision: edited.draftRevision,
          content: {
            to: ["ada@example.com"],
            cc: [],
            bcc: [],
            subject: "Hi later still",
            editableHtml: "<p>Later still</p>",
            quotedHtml: "",
            attachmentIds: [],
          },
        })
      ).status,
    ).toBe("conflict");
    expect(
      await store.admitSend({
        commandId: "send-late-third",
        draft: { accountId: "acc-1", draftId: "d-late" },
        draftRevision: edited.draftRevision,
        replyTo: null,
      }),
    ).toEqual({ status: "rejected", code: "invalid" });
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
    if (edited.status !== "saved") throw new Error("expected save");
    expect(
      (
        await store.admitSend({
          commandId: "send-reject-again",
          draft: { accountId: "acc-1", draftId: "d-reject" },
          draftRevision: edited.draftRevision,
          replyTo: null,
        })
      ).status,
    ).toBe("queued");
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

  it("inspects an uncertain send instead of executing it again", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const saved = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d-inspect" },
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
          commandId: "send-inspect",
          draft: { accountId: "acc-1", draftId: "d-inspect" },
          draftRevision: saved.draftRevision,
          replyTo: null,
        })
      ).status,
    ).toBe("queued");
    const execute = await store.claimWork({
      ownerId: "owner",
      nowMs: Date.now(),
      leaseMs: 30_000,
    });
    expect(execute?.kind).toBe("command");
    if (execute?.kind !== "command") throw new Error("expected command");
    await store.settleAttempt({
      attemptId: execute.attemptId,
      operation: execute.operation,
      result: { status: "uncertain", receiptId: "r-inspect" },
    });
    const inspect = await store.claimWork({
      ownerId: "owner",
      nowMs: Date.now(),
      leaseMs: 30_000,
    });
    expect(inspect?.kind).toBe("inspect");
    if (inspect?.kind !== "inspect") throw new Error("expected inspect");
    expect(inspect.receiptId).toBe("r-inspect");
    expect(inspect.operation.key.operationId).toBe("send-inspect");
    expect(
      (
        await store.settleAttempt({
          attemptId: inspect.attemptId,
          operation: inspect.operation,
          result: {
            status: "confirmed",
            receiptId: "r-inspect",
            observations: [],
            targets: [],
          },
        })
      ).status,
    ).toBe("committed");
    expect(
      await store.readOperation({
        accountId: "acc-1",
        operationId: "send-inspect",
      }),
    ).toMatchObject({ operation: { status: "succeeded" } });
    expect(
      (
        await store.saveDraft({
          key: { accountId: "acc-1", draftId: "d-inspect" },
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
    await store.close();
  });

  it("keeps inspecting after not_dispatched and preserves the receipt", async () => {
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
          commandId: "send-hold",
          draft: { accountId: "acc-1", draftId: "d-hold" },
          draftRevision: saved.draftRevision,
          replyTo: null,
        })
      ).status,
    ).toBe("queued");
    const execute = await store.claimWork({
      ownerId: "owner",
      nowMs: Date.now(),
      leaseMs: 30_000,
    });
    expect(execute?.kind).toBe("command");
    if (execute?.kind !== "command") throw new Error("expected command");
    await store.settleAttempt({
      attemptId: execute.attemptId,
      operation: execute.operation,
      result: { status: "uncertain", receiptId: "r-hold" },
    });
    const inspect = await store.claimWork({
      ownerId: "owner",
      nowMs: Date.now(),
      leaseMs: 30_000,
    });
    expect(inspect?.kind).toBe("inspect");
    if (inspect?.kind !== "inspect") throw new Error("expected inspect");
    await store.settleAttempt({
      attemptId: inspect.attemptId,
      operation: inspect.operation,
      result: {
        status: "not_dispatched",
        reason: "throttled",
        retryAfterMs: 5000,
      },
    });
    const nowMs = Date.now();
    expect(
      await store.claimWork({
        ownerId: "owner",
        nowMs,
        leaseMs: 30_000,
      }),
    ).toBeNull();
    const again = await store.claimWork({
      ownerId: "owner",
      nowMs: nowMs + 5000,
      leaseMs: 30_000,
    });
    expect(again?.kind).toBe("inspect");
    if (again?.kind !== "inspect") throw new Error("expected inspect");
    expect(again.receiptId).toBe("r-hold");
    await store.settleAttempt({
      attemptId: again.attemptId,
      operation: again.operation,
      result: { status: "uncertain", receiptId: null },
    });
    expect(
      (
        await store.saveDraft({
          key: { accountId: "acc-1", draftId: "d-hold" },
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
    const afterNullReceipt = Date.now();
    expect(
      await store.claimWork({
        ownerId: "owner",
        nowMs: afterNullReceipt,
        leaseMs: 30_000,
      }),
    ).toBeNull();
    const later = await store.claimWork({
      ownerId: "owner",
      nowMs: afterNullReceipt + 1000,
      leaseMs: 30_000,
    });
    expect(later?.kind).toBe("inspect");
    if (later?.kind !== "inspect") throw new Error("expected inspect");
    expect(later.receiptId).toBe("r-hold");
    await store.settleAttempt({
      attemptId: later.attemptId,
      operation: later.operation,
      result: { status: "uncertain", receiptId: "" },
    });
    const afterEmptyReceipt = Date.now();
    expect(
      await store.claimWork({
        ownerId: "owner",
        nowMs: afterEmptyReceipt,
        leaseMs: 30_000,
      }),
    ).toBeNull();
    const emptyReceipt = await store.claimWork({
      ownerId: "owner",
      nowMs: afterEmptyReceipt + 1000,
      leaseMs: 30_000,
    });
    expect(emptyReceipt?.kind).toBe("inspect");
    if (emptyReceipt?.kind !== "inspect") throw new Error("expected inspect");
    expect(emptyReceipt.receiptId).toBe("r-hold");
    await store.close();
  });

  it("keeps inspecting after inspect blocked_auth", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const saved = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d-auth" },
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
          commandId: "send-auth",
          draft: { accountId: "acc-1", draftId: "d-auth" },
          draftRevision: saved.draftRevision,
          replyTo: null,
        })
      ).status,
    ).toBe("queued");
    const execute = await store.claimWork({
      ownerId: "owner",
      nowMs: Date.now(),
      leaseMs: 30_000,
    });
    expect(execute?.kind).toBe("command");
    if (execute?.kind !== "command") throw new Error("expected command");
    await store.settleAttempt({
      attemptId: execute.attemptId,
      operation: execute.operation,
      result: { status: "uncertain", receiptId: "r-auth" },
    });
    const inspect = await store.claimWork({
      ownerId: "owner",
      nowMs: Date.now(),
      leaseMs: 30_000,
    });
    expect(inspect?.kind).toBe("inspect");
    if (inspect?.kind !== "inspect") throw new Error("expected inspect");
    await store.settleAttempt({
      attemptId: inspect.attemptId,
      operation: inspect.operation,
      result: {
        status: "not_dispatched",
        reason: "blocked_auth",
        retryAfterMs: 5000,
      },
    });
    expect(
      await store.readOperation({
        accountId: "acc-1",
        operationId: "send-auth",
      }),
    ).toMatchObject({ operation: { status: "uncertain" } });
    const nowMs = Date.now();
    expect(
      await store.claimWork({
        ownerId: "owner",
        nowMs,
        leaseMs: 30_000,
      }),
    ).toBeNull();
    const again = await store.claimWork({
      ownerId: "owner",
      nowMs: nowMs + 5000,
      leaseMs: 30_000,
    });
    expect(again?.kind).toBe("inspect");
    if (again?.kind !== "inspect") throw new Error("expected inspect");
    expect(again.receiptId).toBe("r-auth");
    await store.close();
  });

  it("records execute blocked_auth instead of inspect", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const saved = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d-exec-auth" },
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
          commandId: "send-exec-auth",
          draft: { accountId: "acc-1", draftId: "d-exec-auth" },
          draftRevision: saved.draftRevision,
          replyTo: null,
        })
      ).status,
    ).toBe("queued");
    const execute = await store.claimWork({
      ownerId: "owner",
      nowMs: Date.now(),
      leaseMs: 30_000,
    });
    expect(execute?.kind).toBe("command");
    if (execute?.kind !== "command") throw new Error("expected command");
    await store.settleAttempt({
      attemptId: execute.attemptId,
      operation: execute.operation,
      result: {
        status: "not_dispatched",
        reason: "blocked_auth",
        retryAfterMs: 5000,
      },
    });
    expect(
      await store.readOperation({
        accountId: "acc-1",
        operationId: "send-exec-auth",
      }),
    ).toMatchObject({ operation: { status: "blocked_auth" } });
    expect(
      await store.claimWork({
        ownerId: "owner",
        nowMs: Date.now() + 5000,
        leaseMs: 30_000,
      }),
    ).toBeNull();
    await store.close();
  });

  it("reclaims an executing command after the lease expires", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const saved = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d-lease" },
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
          commandId: "send-lease",
          draft: { accountId: "acc-1", draftId: "d-lease" },
          draftRevision: saved.draftRevision,
          replyTo: null,
        })
      ).status,
    ).toBe("queued");
    const first = await store.claimWork({
      ownerId: "owner-a",
      nowMs: 1000,
      leaseMs: 30_000,
    });
    expect(first?.kind).toBe("command");
    if (first?.kind !== "command") throw new Error("expected command");
    expect(
      await store.claimWork({
        ownerId: "owner-b",
        nowMs: 31_000,
        leaseMs: 30_000,
      }),
    ).toBeNull();
    const reclaimed = await store.claimWork({
      ownerId: "owner-b",
      nowMs: 31_001,
      leaseMs: 30_000,
    });
    expect(reclaimed?.kind).toBe("command");
    if (reclaimed?.kind !== "command") throw new Error("expected command");
    expect(reclaimed.attemptId).not.toBe(first.attemptId);
    expect(
      await store.settleAttempt({
        attemptId: first.attemptId,
        operation: first.operation,
        result: {
          status: "confirmed",
          receiptId: "stale-lease",
          observations: [],
          targets: [],
        },
      }),
    ).toMatchObject({ status: "stale" });
    await store.settleAttempt({
      attemptId: reclaimed.attemptId,
      operation: reclaimed.operation,
      result: {
        status: "confirmed",
        receiptId: "r-lease",
        observations: [],
        targets: [],
      },
    });
    expect(
      await store.readOperation({
        accountId: "acc-1",
        operationId: "send-lease",
      }),
    ).toMatchObject({ operation: { status: "succeeded" } });
    await store.close();
  });

  it("inspects a verifying send after next_attempt_at_ms", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const saved = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d-verify" },
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
          commandId: "send-verify",
          draft: { accountId: "acc-1", draftId: "d-verify" },
          draftRevision: saved.draftRevision,
          replyTo: null,
        })
      ).status,
    ).toBe("queued");
    const execute = await store.claimWork({
      ownerId: "owner",
      nowMs: Date.now(),
      leaseMs: 30_000,
    });
    expect(execute?.kind).toBe("command");
    if (execute?.kind !== "command") throw new Error("expected command");
    const retryAfterMs = 5000;
    await store.settleAttempt({
      attemptId: execute.attemptId,
      operation: execute.operation,
      result: {
        status: "accepted",
        receiptId: "r-verify",
        retryAfterMs,
      },
    });
    const nowMs = Date.now();
    expect(
      await store.claimWork({
        ownerId: "owner",
        nowMs,
        leaseMs: 30_000,
      }),
    ).toBeNull();
    const inspect = await store.claimWork({
      ownerId: "owner",
      nowMs: nowMs + retryAfterMs,
      leaseMs: 30_000,
    });
    expect(inspect?.kind).toBe("inspect");
    if (inspect?.kind !== "inspect") throw new Error("expected inspect");
    expect(inspect.receiptId).toBe("r-verify");
    await store.settleAttempt({
      attemptId: inspect.attemptId,
      operation: inspect.operation,
      result: {
        status: "not_dispatched",
        reason: "throttled",
        retryAfterMs: 5000,
      },
    });
    expect(
      await store.readOperation({
        accountId: "acc-1",
        operationId: "send-verify",
      }),
    ).toMatchObject({ operation: { status: "verifying" } });
    const afterInspectHold = Date.now();
    expect(
      await store.claimWork({
        ownerId: "owner",
        nowMs: afterInspectHold,
        leaseMs: 30_000,
      }),
    ).toBeNull();
    const again = await store.claimWork({
      ownerId: "owner",
      nowMs: afterInspectHold + 5000,
      leaseMs: 30_000,
    });
    expect(again?.kind).toBe("inspect");
    if (again?.kind !== "inspect") throw new Error("expected inspect");
    expect(again.receiptId).toBe("r-verify");
    await store.close();
  });

  it("recovers an uncertain send through inspect without sending again", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const saved = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d-engine" },
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
    let executes = 0;
    let inspects = 0;
    const engine = createMailEngine({
      store,
      source: fixtureSource(new Map()),
      executor: {
        async execute() {
          executes += 1;
          return { status: "uncertain", receiptId: "r-engine" };
        },
        async inspect({ receiptId }) {
          inspects += 1;
          expect(receiptId).toBe("r-engine");
          return {
            status: "confirmed",
            receiptId: "r-engine",
            observations: [],
            targets: [],
          };
        },
      },
      runtime: createHostRuntime(),
    });
    expect(
      (
        await engine.submitSend({
          commandId: "send-engine",
          draft: { accountId: "acc-1", draftId: "d-engine" },
          draftRevision: saved.draftRevision,
          replyTo: null,
        })
      ).status,
    ).toBe("queued");
    await engine.runUntil(Date.now() + 2000);
    expect(executes).toBe(1);
    expect(inspects).toBe(1);
    expect(
      await store.readOperation({
        accountId: "acc-1",
        operationId: "send-engine",
      }),
    ).toMatchObject({ operation: { status: "succeeded" } });
    expect(
      (
        await store.saveDraft({
          key: { accountId: "acc-1", draftId: "d-engine" },
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
    await engine.close();
  });

  it("does not execute again when inspect is not_dispatched", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const saved = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d-throttle" },
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
    let executes = 0;
    let inspects = 0;
    const engine = createMailEngine({
      store,
      source: fixtureSource(new Map()),
      executor: {
        async execute() {
          executes += 1;
          return { status: "uncertain", receiptId: "r-throttle" };
        },
        async inspect({ receiptId }) {
          inspects += 1;
          expect(receiptId).toBe("r-throttle");
          if (inspects === 1) {
            return {
              status: "not_dispatched",
              reason: "throttled",
              retryAfterMs: 0,
            };
          }
          return {
            status: "confirmed",
            receiptId: "r-throttle",
            observations: [],
            targets: [],
          };
        },
      },
      runtime: createHostRuntime(),
    });
    expect(
      (
        await engine.submitSend({
          commandId: "send-throttle",
          draft: { accountId: "acc-1", draftId: "d-throttle" },
          draftRevision: saved.draftRevision,
          replyTo: null,
        })
      ).status,
    ).toBe("queued");
    await engine.runUntil(Date.now() + 2000);
    expect(executes).toBe(1);
    expect(inspects).toBe(2);
    expect(
      await store.readOperation({
        accountId: "acc-1",
        operationId: "send-throttle",
      }),
    ).toMatchObject({ operation: { status: "succeeded" } });
    await engine.close();
  });

  it("only tombstones unseen messages for deletion-authoritative scopes", async () => {
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
      session: { accountId: "acc-1", generation: "g1" },
      scopeId: "primary",
      seenMessageIds: ["kept"],
    });
    let inspection = await store.inspect();
    expect(
      inspection.messages.find((row) => row.messageId === "kept")?.deleted,
    ).toBe(false);
    expect(
      inspection.messages.find((row) => row.messageId === "gone")?.deleted,
    ).toBe(false);
    await store.tombstoneUnseen({
      session: { accountId: "acc-1", generation: "g1" },
      scopeId: "account:all",
      seenMessageIds: ["kept"],
    });
    inspection = await store.inspect();
    expect(
      inspection.messages.find((row) => row.messageId === "gone")?.deleted,
    ).toBe(true);
    await store.close();
  });

  it("rejects bootstrap completion after the stream advances concurrently", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    const session = { accountId: "acc-1", generation: "g1" };
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session,
        requestId: "old-stream",
        from: { streamId: "primary", generation: "g1", checkpoint: null },
        to: { streamId: "primary", generation: "g1", checkpoint: "old" },
        changes: [messagePatch("m-old", "c-old", 1000, ["inbox"])],
        requiredHydration: [],
        roundComplete: true,
      },
    });
    const from = {
      streamId: "primary",
      generation: "g1",
      checkpoint: "old",
    };
    await store.startBootstrapScan({
      session,
      scopeId: "account:all",
      bootstrapId: "boot",
      page: "page-1",
      from,
      catchUpFrom: null,
      nowMs: 1000,
    });
    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session,
        requestId: "concurrent",
        from,
        to: { streamId: "primary", generation: "g1", checkpoint: "newer" },
        changes: [messagePatch("m-new", "c-new", 2000, ["inbox"])],
        requiredHydration: [],
        roundComplete: true,
      },
    });
    const stale = await store.applyBootstrapPage({
      session,
      scopeId: "account:all",
      bootstrapId: "boot",
      previousPage: "page-1",
      nextPage: null,
      from,
      catchUpFrom: {
        streamId: "primary",
        generation: "g1",
        checkpoint: "boot",
      },
      requestId: "boot-page",
      changes: [messagePatch("m-boot", "c-boot", 3000, ["inbox"])],
      requiredHydration: [],
      bodies: [],
      ownerId: "owner",
    });
    expect(stale.status).toBe("stale");
    const inspection = await store.inspect();
    expect(inspection.streams[0]?.checkpoint).toBe("newer");
    expect(
      inspection.messages.find((message) => message.messageId === "m-new")
        ?.deleted,
    ).toBe(false);
    await store.close();
  });

  it("only deletes messages that existed when an authoritative bootstrap started", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    const session = { accountId: "acc-1", generation: "g1" };
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session,
        requestId: "old-stream",
        from: { streamId: "primary", generation: "g1", checkpoint: null },
        to: { streamId: "primary", generation: "g1", checkpoint: "old" },
        changes: [messagePatch("m-gone", "c-gone", 1000, ["inbox"])],
        requiredHydration: [],
        roundComplete: true,
      },
    });
    const from = {
      streamId: "primary",
      generation: "g1",
      checkpoint: "old",
    };
    await store.startBootstrapScan({
      session,
      scopeId: "account:all",
      bootstrapId: "boot",
      page: "page-1",
      from,
      catchUpFrom: null,
      nowMs: 1000,
    });
    await store.applyHydration({
      session,
      requestId: "hydrate-new",
      changes: [messagePatch("m-new", "c-new", 2000, ["inbox"])],
      bodies: [],
    });
    const committed = await store.applyBootstrapPage({
      session,
      scopeId: "account:all",
      bootstrapId: "boot",
      previousPage: "page-1",
      nextPage: null,
      from,
      catchUpFrom: {
        streamId: "primary",
        generation: "g1",
        checkpoint: "boot",
      },
      requestId: "boot-page",
      changes: [messagePatch("m-kept", "c-kept", 3000, ["inbox"])],
      requiredHydration: [],
      bodies: [],
      ownerId: "owner",
    });
    expect(committed.status).toBe("committed");
    const inspection = await store.inspect();
    expect(
      inspection.messages.find((message) => message.messageId === "m-gone")
        ?.deleted,
    ).toBe(true);
    expect(
      inspection.messages.find((message) => message.messageId === "m-new")
        ?.deleted,
    ).toBe(false);
    expect(
      inspection.messages.find((message) => message.messageId === "m-kept")
        ?.deleted,
    ).toBe(false);
    await store.close();
  });

  it("clears stale folder membership without deleting messages on folder bootstrap completion", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    const session = { accountId: "acc-1", generation: "g1" };
    const inFolderA = messagePatch("m-a", "c-a", 1000, []);
    const inFolderB = messagePatch("m-b", "c-b", 2000, []);
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "microsoft",
      generation: "g1",
    });
    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session,
        requestId: "folder-state",
        from: { streamId: "folder:a", generation: "g1", checkpoint: null },
        to: { streamId: "folder:a", generation: "g1", checkpoint: "old" },
        changes: [
          {
            ...inFolderA,
            fields: { ...inFolderA.fields, folderId: "a" },
          },
          {
            ...inFolderB,
            fields: { ...inFolderB.fields, folderId: "b" },
          },
        ],
        requiredHydration: [],
        roundComplete: true,
      },
    });
    await store.startBootstrapScan({
      session,
      scopeId: "folder:a",
      bootstrapId: "boot-folder-a",
      page: "page-1",
      from: { streamId: "folder:a", generation: "g1", checkpoint: "old" },
      catchUpFrom: null,
      nowMs: 1000,
    });
    const committed = await store.applyBootstrapPage({
      session,
      scopeId: "folder:a",
      bootstrapId: "boot-folder-a",
      previousPage: "page-1",
      nextPage: null,
      from: { streamId: "folder:a", generation: "g1", checkpoint: "old" },
      catchUpFrom: {
        streamId: "folder:a",
        generation: "g1",
        checkpoint: "boot",
      },
      requestId: "folder-page",
      changes: [],
      requiredHydration: [],
      bodies: [],
      ownerId: "owner",
    });
    expect(committed.status).toBe("committed");
    const inspection = await store.inspect();
    expect(
      inspection.messages.find((message) => message.messageId === "m-a"),
    ).toMatchObject({
      deleted: false,
      confirmed: expect.objectContaining({ folderId: null }),
    });
    expect(
      inspection.messages.find((message) => message.messageId === "m-b"),
    ).toMatchObject({
      deleted: false,
      confirmed: expect.objectContaining({ folderId: "b" }),
    });
    const folderA = await store.readMailboxView({
      accountIds: ["acc-1"],
      predicate: { kind: "membership", membership: "folder", id: "a" },
      order: "newest_first",
      pageSize: 25,
      after: null,
    });
    expect(folderA.view.counts.matchingConversations).toBe(0);
    await store.close();
  });

  it("rejects command settlement from an old account generation", async () => {
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
        requestId: "initial",
        from: { streamId: "primary", generation: "g1", checkpoint: null },
        to: { streamId: "primary", generation: "g1", checkpoint: "1" },
        changes: [messagePatch("m1", "c1", 1000, ["inbox"])],
        requiredHydration: [],
        roundComplete: true,
      },
    });
    await store.admitMetadata({
      accountId: "acc-1",
      commandId: "archive-old-gen",
      targets: [{ accountId: "acc-1", messageId: "m1" }],
      change: { kind: "archive" },
    });
    const work = await store.claimWork({
      ownerId: "owner",
      nowMs: 1000,
      leaseMs: 30_000,
    });
    expect(work?.kind).toBe("command");
    if (work?.kind !== "command") throw new Error("expected command");
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g2",
    });
    const stale = await store.settleAttempt({
      attemptId: work.attemptId,
      operation: work.operation,
      result: {
        status: "confirmed",
        receiptId: "old-generation-receipt",
        observations: [
          messagePatch("m-old-response", "c-old-response", 2000, ["inbox"]),
        ],
        targets: [
          {
            key: { accountId: "acc-1", messageId: "m1" },
            outcome: "applied",
            code: null,
          },
        ],
      },
    });
    expect(stale.status).toBe("stale");
    const inspection = await store.inspect();
    expect(
      inspection.messages.some(
        (message) => message.messageId === "m-old-response",
      ),
    ).toBe(false);
    expect(
      inspection.operations.find(
        (operation) => operation.key.operationId === "archive-old-gen",
      )?.status,
    ).toBe("executing");
    await store.close();
  });

  it("resets derived sync state on account generation changes while preserving user work", async () => {
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
        requestId: "initial",
        from: { streamId: "primary", generation: "g1", checkpoint: null },
        to: { streamId: "primary", generation: "g1", checkpoint: "1" },
        changes: [messagePatch("m1", "c1", 1000, ["inbox"])],
        requiredHydration: [],
        roundComplete: true,
      },
    });
    await store.enqueueHydration({
      keys: [{ accountId: "acc-1", messageId: "m1" }],
      purpose: "body",
    });
    await store.applyAssistantEntries({
      accountId: "acc-1",
      cursor: "assistant-cursor",
      entries: [
        {
          id: "assistant-entry",
          revision: "1",
          messageId: "m1",
          conversationId: "c1",
          kind: "summary",
          payload: { text: "cached" },
        },
      ],
    });
    const saved = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "draft-1" },
      expectedRevision: null,
      content: {
        to: ["ada@example.com"],
        cc: [],
        bcc: [],
        subject: "Draft",
        editableHtml: "<p>Draft</p>",
        quotedHtml: "",
        attachmentIds: [],
      },
    });
    expect(saved.status).toBe("saved");
    await store.admitMetadata({
      accountId: "acc-1",
      commandId: "archive-after-reset",
      targets: [{ accountId: "acc-1", messageId: "m1" }],
      change: { kind: "archive" },
    });
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "microsoft",
      generation: "g2",
    });
    const [syncState] = await store.readAccountSyncStates();
    expect(syncState).toMatchObject({
      accountId: "acc-1",
      generation: "g2",
      assistantCursor: null,
      streams: [],
    });
    const inspection = await store.inspect();
    expect(inspection.messages).toEqual([]);
    expect(inspection.coverage).toEqual([
      expect.objectContaining({ accountId: "acc-1", metadata: "partial" }),
    ]);
    expect(inspection.streams).toEqual([]);
    expect(inspection.assistantEntries).toEqual([]);
    expect((await store.getDiagnostics("acc-1")).pendingJobs).toBe(0);
    expect(
      await store.readDraft({ accountId: "acc-1", draftId: "draft-1" }),
    ).toMatchObject({ status: "found" });
    expect(
      await store.readOperation({
        accountId: "acc-1",
        operationId: "archive-after-reset",
      }),
    ).toMatchObject({
      operation: expect.objectContaining({ status: "queued" }),
    });
    await store.close();
  });

  it("keeps hydration jobs account-scoped when message ids overlap", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    await store.ensureAccount({
      accountId: "acc-2",
      provider: "microsoft",
      generation: "g1",
    });
    await store.enqueueHydration({
      keys: [
        { accountId: "acc-1", messageId: "same-message-id" },
        { accountId: "acc-2", messageId: "same-message-id" },
      ],
      purpose: "body",
    });
    const first = await store.claimWork({
      ownerId: "owner",
      nowMs: 1000,
      leaseMs: 30_000,
    });
    const second = await store.claimWork({
      ownerId: "owner",
      nowMs: 1000,
      leaseMs: 30_000,
    });
    expect(first?.kind).toBe("hydrate");
    expect(second?.kind).toBe("hydrate");
    if (first?.kind !== "hydrate" || second?.kind !== "hydrate") {
      throw new Error("expected hydrate jobs");
    }
    expect(
      new Set([first.session.accountId, second.session.accountId]),
    ).toEqual(new Set(["acc-1", "acc-2"]));
    expect(first.jobId).not.toBe(second.jobId);
    expect(first.keys).toEqual([
      { accountId: first.session.accountId, messageId: "same-message-id" },
    ]);
    expect(second.keys).toEqual([
      { accountId: second.session.accountId, messageId: "same-message-id" },
    ]);
    await store.close();
  });

  it("batches required body hydration from sync pages", async () => {
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
        requestId: "bootstrap",
        from: { streamId: "primary", generation: "g1", checkpoint: null },
        to: { streamId: "primary", generation: "g1", checkpoint: "1" },
        changes: [
          messagePatch("m3", "c3", 3000, ["inbox"]),
          messagePatch("m1", "c1", 1000, ["inbox"]),
          messagePatch("m2", "c2", 2000, ["inbox"]),
        ],
        requiredHydration: [
          { accountId: "acc-1", messageId: "m3" },
          { accountId: "acc-1", messageId: "m1" },
          { accountId: "acc-1", messageId: "m2" },
          { accountId: "acc-1", messageId: "m2" },
        ],
        roundComplete: true,
      },
    });
    expect((await store.getDiagnostics("acc-1")).pendingJobs).toBe(1);

    const work = await claimHydration(store);
    expect(work.keys).toEqual([
      { accountId: "acc-1", messageId: "m1" },
      { accountId: "acc-1", messageId: "m2" },
      { accountId: "acc-1", messageId: "m3" },
    ]);
    expect(
      await store.claimWork({
        ownerId: "owner-2",
        nowMs: 1000,
        leaseMs: 30_000,
      }),
    ).toBeNull();
    await store.close();
  });

  it("chunks required body hydration from sync pages to the provider request limit", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const changes = Array.from({ length: 21 }, (_, index) =>
      messagePatch(`m${String(index).padStart(2, "0")}`, `c${index}`, index, [
        "inbox",
      ]),
    );
    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "bootstrap",
        from: { streamId: "primary", generation: "g1", checkpoint: null },
        to: { streamId: "primary", generation: "g1", checkpoint: "1" },
        changes,
        requiredHydration: changes.map((change) => change.key),
        roundComplete: true,
      },
    });
    const first = await claimHydration(store, "worker-1");
    const second = await claimHydration(store, "worker-2");
    expect(
      [first.keys.length, second.keys.length].sort((a, b) => a - b),
    ).toEqual([1, 20]);
    expect(
      await store.claimWork({
        ownerId: "worker-3",
        nowMs: 1000,
        leaseMs: 30_000,
      }),
    ).toBeNull();
    await store.close();
  });

  it("dedupes pending and already fresh body hydration from sync pages", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const key = { accountId: "acc-1", messageId: "m1" };
    const initialVersion = "9007199254740993";
    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "page-1",
        from: { streamId: "primary", generation: "g1", checkpoint: null },
        to: { streamId: "primary", generation: "g1", checkpoint: "1" },
        changes: [
          messagePatchWithVersion("m1", "c1", 1000, ["inbox"], initialVersion),
        ],
        requiredHydration: [key],
        roundComplete: true,
      },
    });
    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "page-2",
        from: { streamId: "primary", generation: "g1", checkpoint: "1" },
        to: { streamId: "primary", generation: "g1", checkpoint: "2" },
        changes: [
          messagePatchWithVersion("m1", "c1", 1000, ["inbox"], initialVersion),
        ],
        requiredHydration: [key],
        roundComplete: true,
      },
    });
    expect((await store.getDiagnostics("acc-1")).pendingJobs).toBe(1);

    const work = await claimHydration(store);
    await store.applyHydration({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: work.jobId,
      changes: [],
      bodies: [
        {
          key,
          version: initialVersion,
          html: "<p>fresh</p>",
          text: "fresh",
        },
      ],
    });
    await store.completeJob({
      jobId: work.jobId,
      attemptId: work.attemptId,
    });
    expect((await store.getDiagnostics("acc-1")).pendingJobs).toBe(0);

    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "page-3",
        from: { streamId: "primary", generation: "g1", checkpoint: "2" },
        to: { streamId: "primary", generation: "g1", checkpoint: "3" },
        changes: [
          messagePatchWithVersion("m1", "c1", 1000, ["inbox"], initialVersion),
        ],
        requiredHydration: [key],
        roundComplete: true,
      },
    });
    expect((await store.getDiagnostics("acc-1")).pendingJobs).toBe(0);

    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "page-4",
        from: { streamId: "primary", generation: "g1", checkpoint: "3" },
        to: { streamId: "primary", generation: "g1", checkpoint: "4" },
        changes: [
          messagePatchWithVersion(
            "m1",
            "c1",
            1000,
            ["inbox"],
            "9007199254740994",
          ),
        ],
        requiredHydration: [key],
        roundComplete: true,
      },
    });
    expect((await store.getDiagnostics("acc-1")).pendingJobs).toBe(1);
    await store.close();
  });

  it("does not let a stale sync-job attempt complete a reclaimed hydration job", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    await store.enqueueHydration({
      keys: [{ accountId: "acc-1", messageId: "m1" }],
      purpose: "body",
    });
    const first = await store.claimWork({
      ownerId: "worker-1",
      nowMs: 1000,
      leaseMs: 30_000,
    });
    expect(first?.kind).toBe("hydrate");
    if (first?.kind !== "hydrate") throw new Error("expected hydrate");
    const reclaimed = await store.claimWork({
      ownerId: "worker-2",
      nowMs: 31_001,
      leaseMs: 30_000,
    });
    expect(reclaimed?.kind).toBe("hydrate");
    if (reclaimed?.kind !== "hydrate") throw new Error("expected hydrate");
    expect(reclaimed.attemptId).not.toBe(first.attemptId);

    const staleApply = await store.applyHydration({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: first.jobId,
      attemptId: first.attemptId,
      changes: [messagePatch("m1", "c1", 1000, ["inbox"])],
      bodies: [
        {
          key: { accountId: "acc-1", messageId: "m1" },
          version: "1",
          html: "<p>old worker</p>",
          text: "old worker",
        },
      ],
    });
    expect(staleApply.status).toBe("stale");
    const currentApply = await store.applyHydration({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: reclaimed.jobId,
      attemptId: reclaimed.attemptId,
      changes: [messagePatch("m1", "c1", 1000, ["inbox"])],
      bodies: [
        {
          key: { accountId: "acc-1", messageId: "m1" },
          version: "1",
          html: "<p>current worker</p>",
          text: "current worker",
        },
      ],
    });
    expect(currentApply.status).toBe("committed");

    await store.completeJob({
      jobId: first.jobId,
      attemptId: first.attemptId,
    });
    expect((await store.getDiagnostics("acc-1")).pendingJobs).toBe(1);

    await store.completeJob({
      jobId: reclaimed.jobId,
      attemptId: reclaimed.attemptId,
    });
    expect((await store.getDiagnostics("acc-1")).pendingJobs).toBe(0);
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

  it("reports the reply-to message on a queued send", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const saved = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d-reply" },
      expectedRevision: null,
      content: {
        to: ["leslie@example.com"],
        cc: [],
        bcc: [],
        subject: "Re: Reply Workflow Message",
        editableHtml: "<p>Thursday works.</p>",
        quotedHtml: "",
        attachmentIds: [],
      },
    });
    expect(saved.status).toBe("saved");
    if (saved.status !== "saved") throw new Error("expected save");
    expect(
      (
        await store.admitSend({
          commandId: "send-reply",
          conversationId: "thr_playwright_reply",
          draft: { accountId: "acc-1", draftId: "d-reply" },
          draftRevision: saved.draftRevision,
          replyTo: { accountId: "acc-1", messageId: "msg_playwright_reply" },
        })
      ).status,
    ).toBe("queued");
    const diagnostics = await store.getDiagnostics("acc-1");
    expect(
      diagnostics.commands.find(
        (command) => command.operationId === "send-reply",
      ),
    ).toMatchObject({
      conversationIds: ["thr_playwright_reply"],
      messageIds: ["msg_playwright_reply"],
    });
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

  it("only bumps the revision when the connection state changes", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const revision = async () =>
      (await store.getDiagnostics("acc-1")).revision.sequence;
    const initial = await revision();
    expect(
      await store.recordConnection({ accountId: "acc-1", connection: "ready" }),
    ).toBe(false);
    expect(await revision()).toBe(initial);
    expect(
      await store.recordConnection({
        accountId: "acc-1",
        connection: "offline",
      }),
    ).toBe(true);
    expect(await revision()).toBe(initial + 1);
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
    const work = await claimPreparation(store, "archive-c1");
    const cancelled = await store.cancelOperation({
      accountId: "acc-1",
      operationId: "archive-c1",
    });
    expect(cancelled.status).toBe("cancelled");
    const delayed = await store.applyPreparationPage({
      accountId: "acc-1",
      commandId: "archive-c1",
      attemptId: work.attemptId,
      session: work.session,
      previousPage: work.page,
      page: {
        conversation: { accountId: "acc-1", conversationId: "c1" },
        resolutionId: work.resolutionId,
        keys: [{ accountId: "acc-1", messageId: "m1" }],
        changes: [],
        nextPage: null,
        evidence: null,
      },
    });
    expect(delayed.status).toBe("stale");
    await store.close();
  });

  it("applies a preparing conversation command to locally known messages", async () => {
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
          messagePatch("m1", "c1", 2000, ["inbox"]),
          messagePatch("m2", "c2", 1000, ["inbox"]),
        ],
        requiredHydration: [],
        roundComplete: true,
      },
    });
    const listed = async () =>
      (await store.readMailboxView(inboxQuery)).view.conversations.map(
        (conversation) => conversation.key.conversationId,
      );
    const admission = await store.admitConversations({
      accountId: "acc-1",
      commandId: "archive-c1",
      conversations: [{ accountId: "acc-1", conversationId: "c1" }],
      change: { kind: "archive" },
      observedRevision: (await store.readMailboxView(inboxQuery)).revision,
    });
    expect(admission.status).toBe("preparing");
    expect(await listed()).toEqual(["c2"]);

    await store.cancelOperation({
      accountId: "acc-1",
      operationId: "archive-c1",
    });
    expect(await listed()).toEqual(["c1", "c2"]);
    await store.close();
  });

  it("restores locally applied effects when conversation preparation fails", async () => {
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
    await store.admitConversations({
      accountId: "acc-1",
      commandId: "archive-c1",
      conversations: [{ accountId: "acc-1", conversationId: "c1" }],
      change: { kind: "archive" },
      observedRevision: (await store.readMailboxView(inboxQuery)).revision,
    });
    const work = await claimPreparation(store, "archive-c1");
    await store.failPreparation({
      accountId: "acc-1",
      commandId: "archive-c1",
      attemptId: work.attemptId,
      session: work.session,
      code: "conversation_not_found",
    });
    expect(
      (await store.readMailboxView(inboxQuery)).view.conversations.map(
        (conversation) => conversation.key.conversationId,
      ),
    ).toEqual(["c1"]);
    await store.close();
  });

  it("leases preparation work and reclaims it only after defer time", async () => {
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
    await store.admitConversations({
      accountId: "acc-1",
      commandId: "archive-c1",
      conversations: [{ accountId: "acc-1", conversationId: "c1" }],
      change: { kind: "archive" },
      observedRevision: revision,
    });
    const first = await claimPreparation(store, "archive-c1", 1000);
    const claimedAgain = await store.claimWork({
      ownerId: "owner-2",
      nowMs: 1100,
      leaseMs: 30_000,
    });
    expect(claimedAgain).toBeNull();
    await store.deferPreparation({
      accountId: "acc-1",
      commandId: "archive-c1",
      attemptId: first.attemptId,
      nextAttemptAtMs: 5000,
    });
    const tooSoon = await store.claimWork({
      ownerId: "owner",
      nowMs: 4999,
      leaseMs: 30_000,
    });
    expect(tooSoon).toBeNull();
    const reclaimed = await store.claimWork({
      ownerId: "owner",
      nowMs: 5000,
      leaseMs: 30_000,
    });
    expect(reclaimed).toMatchObject({
      kind: "prepare",
      commandId: "archive-c1",
    });
    await store.close();
  });

  it("does not let a stale preparation failure change a reclaimed command", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const revision = (await store.readMailboxView(inboxQuery)).revision;
    await store.admitConversations({
      accountId: "acc-1",
      commandId: "archive-c1",
      conversations: [{ accountId: "acc-1", conversationId: "c1" }],
      change: { kind: "archive" },
      observedRevision: revision,
    });
    const first = await claimPreparation(store, "archive-c1", 1000);
    const reclaimed = await claimPreparation(store, "archive-c1", 31_001);

    const stale = await store.failPreparation({
      accountId: "acc-1",
      commandId: "archive-c1",
      attemptId: first.attemptId,
      session: first.session,
      code: "conversation_not_found",
    });
    expect(stale.status).toBe("stale");
    expect(
      (
        await store.readOperation({
          accountId: "acc-1",
          operationId: "archive-c1",
        })
      ).operation?.status,
    ).toBe("preparing");

    const failed = await store.failPreparation({
      accountId: "acc-1",
      commandId: "archive-c1",
      attemptId: reclaimed.attemptId,
      session: reclaimed.session,
      code: "conversation_not_found",
    });
    expect(failed.status).toBe("committed");
    expect(
      (
        await store.readOperation({
          accountId: "acc-1",
          operationId: "archive-c1",
        })
      ).operation?.status,
    ).toBe("failed");
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
    const work = await claimPreparation(store, "archive-c1");
    const duringPrep = await store.applyPreparationPage({
      accountId: "acc-1",
      commandId: "archive-c1",
      attemptId: work.attemptId,
      session: work.session,
      previousPage: work.page,
      page: {
        conversation: { accountId: "acc-1", conversationId: "c1" },
        resolutionId: work.resolutionId,
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
      attemptId: work.attemptId,
      session: work.session,
      previousPage: work.page,
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
    const firstWork = await claimPreparation(store, "archive-pages");
    const staleResolution = await store.applyPreparationPage({
      accountId: "acc-1",
      commandId: "archive-pages",
      attemptId: firstWork.attemptId,
      session: firstWork.session,
      previousPage: firstWork.page,
      page: {
        conversation: { accountId: "acc-1", conversationId: "c1" },
        resolutionId: "wrong-resolution",
        keys: [{ accountId: "acc-1", messageId: "m1" }],
        changes: [],
        nextPage: "1",
        evidence: null,
      },
    });
    expect(staleResolution.status).toBe("stale");
    const firstPage = await store.applyPreparationPage({
      accountId: "acc-1",
      commandId: "archive-pages",
      attemptId: firstWork.attemptId,
      session: firstWork.session,
      previousPage: firstWork.page,
      page: {
        conversation: { accountId: "acc-1", conversationId: "c1" },
        resolutionId: firstWork.resolutionId,
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
    const secondWork = await claimPreparation(store, "archive-pages");
    expect(secondWork.page).toBe("1");
    const secondPage = await store.applyPreparationPage({
      accountId: "acc-1",
      commandId: "archive-pages",
      attemptId: secondWork.attemptId,
      session: secondWork.session,
      previousPage: secondWork.page,
      page: {
        conversation: { accountId: "acc-1", conversationId: "c1" },
        resolutionId: secondWork.resolutionId,
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
    const freshVersion = "9007199254740994";
    const staleVersion = "9007199254740993";
    const freshPatch = messagePatchWithVersion(
      "m1",
      "c1",
      1000,
      ["inbox"],
      freshVersion,
    );
    const fresh = await store.applyHydration({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "body-2",
      changes: [
        {
          ...freshPatch,
          fields: { ...freshPatch.fields, preview: "new" },
        },
      ],
      bodies: [
        {
          key: { accountId: "acc-1", messageId: "m1" },
          version: freshVersion,
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
          ...messagePatchWithVersion("m1", "c1", 1000, ["inbox"], staleVersion),
          fields: { ...freshPatch.fields, preview: "old" },
        },
      ],
      bodies: [
        {
          key: { accountId: "acc-1", messageId: "m1" },
          version: staleVersion,
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

  it("rejects hydration when an opaque provider version differs from current metadata", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "microsoft",
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
          messagePatchWithVersion("m1", "c1", 1000, ["inbox"], 'W/"current"'),
        ],
        requiredHydration: [],
        roundComplete: true,
      },
    });
    const stale = await store.applyHydration({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "body-old",
      changes: [],
      bodies: [
        {
          key: { accountId: "acc-1", messageId: "m1" },
          version: 'W/"old"',
          html: "<p>old</p>",
          text: "old",
        },
      ],
    });
    expect(stale.status).toBe("stale");

    const current = await store.applyHydration({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "body-current",
      changes: [],
      bodies: [
        {
          key: { accountId: "acc-1", messageId: "m1" },
          version: 'W/"current"',
          html: "<p>current</p>",
          text: "current",
        },
      ],
    });
    expect(current.status).toBe("committed");
    const conversation = await store.readConversation(
      { accountId: "acc-1", conversationId: "c1" },
      { after: null, pageSize: 10 },
    );
    expect(conversation.view.messages[0]?.content).toMatchObject({
      status: "available",
      text: "current",
    });
    await store.close();
  });

  it("rejects hydration from an old account generation", async () => {
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
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g2",
    });
    const stale = await store.applyHydration({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "body-old-generation",
      changes: [
        {
          ...messagePatch("m1", "c1", 1000, ["inbox"]),
          fields: {
            ...messagePatch("m1", "c1", 1000, ["inbox"]).fields,
            preview: "old generation",
          },
        },
      ],
      bodies: [
        {
          key: { accountId: "acc-1", messageId: "m1" },
          version: "2",
          html: "<p>old generation</p>",
          text: "old generation",
        },
      ],
    });
    expect(stale.status).toBe("stale");
    const inspection = await store.inspect();
    expect(inspection.messages).toEqual([]);
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

  it("records assistant metadata without replacing provider truth or a newer local draft", async () => {
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
          id: "a1",
          revision: "1",
          messageId: "m9",
          conversationId: "c9",
          kind: "ARCHIVE",
          payload: {},
        },
        {
          id: "a2",
          revision: "2",
          messageId: "m10",
          conversationId: "c10",
          kind: "DRAFT_SAVED",
          payload: { draftId: "d1", draftRevision: 0 },
        },
      ],
    });
    const inspection = await store.inspect();
    expect(inspection.accounts[0]?.assistantCursor).toBe("a2");
    expect(inspection.messages.some((item) => item.messageId === "m9")).toBe(
      false,
    );
    expect(
      inspection.assistantEntries.map((entry) => ({
        id: entry.id,
        messageId: entry.messageId,
        conversationId: entry.conversationId,
        kind: entry.kind,
      })),
    ).toEqual([
      {
        id: "a1",
        messageId: "m9",
        conversationId: "c9",
        kind: "ARCHIVE",
      },
      {
        id: "a2",
        messageId: "m10",
        conversationId: "c10",
        kind: "DRAFT_SAVED",
      },
    ]);
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

  it("rejects reusing a metadata command id with a different payload", async () => {
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
    expect(
      (
        await store.admitMetadata({
          accountId: "acc-1",
          commandId: "cmd-1",
          targets: [{ accountId: "acc-1", messageId: "m1" }],
          change: { kind: "archive" },
        })
      ).status,
    ).toBe("queued");
    expect(
      await store.admitMetadata({
        accountId: "acc-1",
        commandId: "cmd-1",
        targets: [{ accountId: "acc-1", messageId: "m1" }],
        change: { kind: "archive" },
      }),
    ).toMatchObject({ status: "already_recorded" });
    expect(
      await store.admitMetadata({
        accountId: "acc-1",
        commandId: "cmd-1",
        targets: [{ accountId: "acc-1", messageId: "m1" }],
        change: { kind: "set_starred", starred: true },
      }),
    ).toEqual({ status: "rejected", code: "invalid" });
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

  it.skipIf(process.env.SCALE_TESTS !== "1")(
    "lists and counts 100k conversations under the local query budget",
    async () => {
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
    },
    120_000,
  );

  it.skipIf(process.env.SCALE_TESTS !== "1")(
    "lists and counts 1M conversations in batched pages",
    async () => {
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
    },
    600_000,
  );
});

function messagePatch(
  messageId: string,
  conversationId: string,
  receivedAtMs: number,
  roles: Array<"inbox" | "sent" | "draft" | "trash" | "spam">,
  options: {
    provider?: "google" | "microsoft";
    inboxSection?: "focused" | "other" | null;
  } = {},
): Extract<ProviderChange, { kind: "message_patch" }> {
  return {
    kind: "message_patch",
    key: { accountId: "acc-1", messageId },
    reference: {
      provider: options.provider ?? "google",
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
      inboxSection: options.inboxSection ?? null,
      labelIds: roles.includes("inbox") ? ["INBOX"] : [],
      categoryIds: [],
      roles,
      hasAttachments: false,
    },
  };
}

function messagePatchWithVersion(
  messageId: string,
  conversationId: string,
  receivedAtMs: number,
  roles: Array<"inbox" | "sent" | "draft" | "trash" | "spam">,
  version: string | null,
) {
  const patch = messagePatch(messageId, conversationId, receivedAtMs, roles);
  return {
    ...patch,
    reference: {
      ...patch.reference,
      version,
    },
  };
}

function createLegacyMailboxWithoutExternalUrl(path: string) {
  const db = new DatabaseSync(path);
  try {
    db.exec(`
      CREATE TABLE schema_migrations (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL UNIQUE
      );
      CREATE TABLE profile_state (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        database_epoch TEXT NOT NULL,
        sequence INTEGER NOT NULL,
        owner_fence TEXT
      );
      INSERT INTO profile_state(id, database_epoch, sequence, owner_fence)
      VALUES (1, 'legacy', 0, NULL);
      CREATE TABLE accounts (
        account_id TEXT PRIMARY KEY,
        provider TEXT NOT NULL CHECK (provider IN ('google', 'microsoft')),
        generation TEXT NOT NULL,
        assistant_cursor TEXT,
        connection TEXT
      );
      INSERT INTO accounts(account_id, provider, generation, assistant_cursor, connection)
      VALUES ('acc-1', 'microsoft', 'g1', NULL, 'ready');
      CREATE TABLE messages (
        account_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        provider TEXT NOT NULL,
        version TEXT,
        subject TEXT NOT NULL,
        preview TEXT NOT NULL,
        from_address TEXT NOT NULL,
        to_json TEXT NOT NULL,
        cc_json TEXT NOT NULL,
        received_at_ms INTEGER NOT NULL,
        read INTEGER NOT NULL CHECK (read IN (0, 1)),
        starred INTEGER NOT NULL CHECK (starred IN (0, 1)),
        folder_id TEXT,
        label_ids_json TEXT NOT NULL,
        category_ids_json TEXT NOT NULL,
        roles_json TEXT NOT NULL,
        in_inbox INTEGER NOT NULL CHECK (in_inbox IN (0, 1)),
        in_sent INTEGER NOT NULL CHECK (in_sent IN (0, 1)),
        in_draft INTEGER NOT NULL CHECK (in_draft IN (0, 1)),
        in_trash INTEGER NOT NULL CHECK (in_trash IN (0, 1)),
        in_spam INTEGER NOT NULL CHECK (in_spam IN (0, 1)),
        has_attachments INTEGER NOT NULL CHECK (has_attachments IN (0, 1)),
        deleted INTEGER NOT NULL DEFAULT 0 CHECK (deleted IN (0, 1)),
        PRIMARY KEY (account_id, message_id)
      );
      CREATE TABLE effective_messages (
        account_id TEXT NOT NULL,
        message_id TEXT NOT NULL,
        conversation_id TEXT NOT NULL,
        subject TEXT NOT NULL,
        preview TEXT NOT NULL,
        from_address TEXT NOT NULL,
        to_json TEXT NOT NULL,
        received_at_ms INTEGER NOT NULL,
        read INTEGER NOT NULL,
        starred INTEGER NOT NULL,
        folder_id TEXT,
        label_ids_json TEXT NOT NULL,
        category_ids_json TEXT NOT NULL,
        roles_json TEXT NOT NULL,
        in_inbox INTEGER NOT NULL,
        in_sent INTEGER NOT NULL,
        in_draft INTEGER NOT NULL,
        in_trash INTEGER NOT NULL,
        in_spam INTEGER NOT NULL,
        has_attachments INTEGER NOT NULL,
        pending_operation_ids_json TEXT NOT NULL,
        PRIMARY KEY (account_id, message_id)
      );
      INSERT INTO messages(
        account_id, message_id, conversation_id, provider, version, subject, preview,
        from_address, to_json, cc_json, received_at_ms, read, starred, folder_id,
        label_ids_json, category_ids_json, roles_json, in_inbox, in_sent, in_draft,
        in_trash, in_spam, has_attachments, deleted
      ) VALUES (
        'acc-1', 'm1', 'c1', 'microsoft', '1', 'Legacy subject', 'Legacy preview',
        'ada@example.com', '["me@example.com"]', '[]', 1000, 0, 0, 'inbox',
        '["INBOX"]', '[]', '["inbox"]', 1, 0, 0, 0, 0, 0, 0
      );
      INSERT INTO effective_messages(
        account_id, message_id, conversation_id, subject, preview, from_address,
        to_json, received_at_ms, read, starred, folder_id, label_ids_json,
        category_ids_json, roles_json, in_inbox, in_sent, in_draft, in_trash,
        in_spam, has_attachments, pending_operation_ids_json
      ) VALUES (
        'acc-1', 'm1', 'c1', 'Legacy subject', 'Legacy preview', 'ada@example.com',
        '["me@example.com"]', 1000, 0, 0, 'inbox', '["INBOX"]',
        '[]', '["inbox"]', 1, 0, 0, 0, 0, 0, '[]'
      );
    `);
  } finally {
    db.close();
  }
}

async function claimPreparation(
  store: MailStore,
  commandId: string,
  nowMs = Date.now(),
): Promise<Extract<ClaimedWork, { kind: "prepare" }>> {
  const work = await store.claimWork({
    ownerId: "owner",
    nowMs,
    leaseMs: 30_000,
  });
  expect(work).toMatchObject({ kind: "prepare", commandId });
  if (work?.kind !== "prepare") throw new Error("expected preparation work");
  return work;
}

async function claimHydration(
  store: MailStore,
  ownerId = "owner",
  nowMs = 1000,
): Promise<Extract<ClaimedWork, { kind: "hydrate" }>> {
  const work = await store.claimWork({
    ownerId,
    nowMs,
    leaseMs: 30_000,
  });
  expect(work).toMatchObject({ kind: "hydrate" });
  if (work?.kind !== "hydrate") throw new Error("expected hydrate work");
  return work;
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
    async readChanges({ session, position, requestId }) {
      return {
        status: "page",
        page: {
          session,
          requestId,
          from: {
            ...position,
            generation: session.generation,
          },
          to: {
            streamId: position.streamId,
            generation: session.generation,
            checkpoint: requestId,
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
