import { describe, expect, it } from "vitest";
import {
  createMailEngine,
  createHostRuntime,
} from "@inboxzero/mail-core/engine";
import type {
  MailboxSource,
  ScopeDescriptor,
} from "@inboxzero/mail-core/ports/mailbox-source";
import type { ProviderChange } from "@inboxzero/mail-core/sync";
import { createNodeSqliteDriver } from "./node-sqlite";
import { createSqliteMailStore } from "./store";

describe("engine bootstrap coverage", () => {
  it("finishes enumeration after bootstrap overruns the runUntil slice", async () => {
    let now = 1000;
    let enumerated = 0;
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const engine = createMailEngine({
      store,
      source: slowBootstrapSource({
        onBootstrap: () => {
          now = 5000;
        },
        onEnumerate: () => {
          enumerated += 1;
        },
      }),
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
    await engine.runUntil(2000);
    const diagnostics = await engine.getDiagnostics("acc-1");
    expect(enumerated).toBe(1);
    expect(diagnostics.coverage).toEqual([
      expect.objectContaining({
        accountId: "acc-1",
        scopeId: "primary",
        metadata: "complete",
      }),
    ]);
    await engine.close();
  });

  it("stores enumerated bodies so bootstrap content is available without hydrate", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const engine = createMailEngine({
      store,
      source: slowBootstrapSource({
        onBootstrap: () => {},
        onEnumerate: () => {},
        body: { html: "<p>First saved reply</p>", text: "First saved reply" },
      }),
      executor: {
        async execute() {
          return { status: "uncertain", receiptId: null };
        },
        async inspect() {
          return { status: "uncertain", receiptId: null };
        },
      },
      runtime: createHostRuntime({ nowMs: () => 1000 }),
    });
    await engine.requestSync(["acc-1"]);
    await engine.runUntil(5000);
    const conversation = await store.readConversation(
      { accountId: "acc-1", conversationId: "c1" },
      { after: null, pageSize: 10 },
    );
    expect(conversation.view.messages[0]?.content).toEqual({
      status: "available",
      html: "<p>First saved reply</p>",
      text: "First saved reply",
      attachments: [],
      isMeetingInvitation: false,
    });
    await engine.close();
  });

  it("removes local messages omitted from a completed bootstrap", async () => {
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
        requestId: "prior",
        from: { streamId: "account:all", generation: "g1", checkpoint: null },
        to: { streamId: "account:all", generation: "g1", checkpoint: "old" },
        changes: [messagePatch("gone", "c-gone", ["draft"])],
        requiredHydration: [],
        roundComplete: true,
      },
    });
    const engine = createMailEngine({
      store,
      source: slowBootstrapSource({
        onBootstrap: () => {},
        onEnumerate: () => {},
        readChangesOnce: { status: "reset_required", scopeId: "account:all" },
        scopeId: "account:all",
      }),
      executor: {
        async execute() {
          return { status: "uncertain", receiptId: null };
        },
        async inspect() {
          return { status: "uncertain", receiptId: null };
        },
      },
      runtime: createHostRuntime({ nowMs: () => 1000 }),
    });
    await engine.requestSync(["acc-1"]);
    await engine.runUntil(5000);
    const inspection = await engine.inspect();
    expect(
      inspection.messages.find((row) => row.messageId === "gone")?.deleted,
    ).toBe(true);
    expect(
      inspection.messages.find((row) => row.messageId === "m1")?.deleted,
    ).toBe(false);
    await engine.close();
  });

  it("resumes a multi-page bootstrap from the stored scan cursor", async () => {
    let now = 1000;
    let beginCalls = 0;
    const enumeratedPages: string[] = [];
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const engine = createMailEngine({
      store,
      source: slowBootstrapSource({
        onBootstrap: () => {
          beginCalls += 1;
        },
        onEnumerate: (page) => {
          enumeratedPages.push(page);
          now += 1000;
        },
        pages: ["page-1", "page-2"],
      }),
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
    await engine.runUntil(1500);
    expect(beginCalls).toBe(1);
    expect(enumeratedPages).toEqual(["page-1"]);
    expect(
      await store.readBootstrapScan({
        session: { accountId: "acc-1", generation: "g1" },
        scopeId: "primary",
      }),
    ).toMatchObject({ page: "page-2" });

    await engine.runUntil(5000);
    expect(beginCalls).toBe(1);
    expect(enumeratedPages).toEqual(["page-1", "page-2"]);
    expect(
      await store.readBootstrapScan({
        session: { accountId: "acc-1", generation: "g1" },
        scopeId: "primary",
      }),
    ).toBeNull();
    const view = await store.readMailboxView({
      accountIds: ["acc-1"],
      predicate: { kind: "role", role: "inbox" },
      order: "newest_first",
      pageSize: 25,
      after: null,
    });
    expect(view.view.counts.matchingConversations).toBe(2);
    await engine.close();
  });

  it("lets a read queued during a sync run in between bootstrap pages", async () => {
    const events: string[] = [];
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const engine = createMailEngine({
      store,
      source: slowBootstrapSource({
        onBootstrap: () => undefined,
        onEnumerate: (page) => {
          events.push(page);
          if (page !== "page-1") return;
          // Stands in for a window request arriving while page 1 is applied.
          setTimeout(() => {
            store.getDiagnostics("acc-1").then(() => events.push("read"));
          }, 0);
        },
        pages: ["page-1", "page-2", "page-3"],
      }),
      executor: {
        async execute() {
          return { status: "uncertain", receiptId: null };
        },
        async inspect() {
          return { status: "uncertain", receiptId: null };
        },
      },
      runtime: createHostRuntime({ nowMs: () => 1000 }),
    });
    await engine.requestSync(["acc-1"]);
    await engine.runUntil(2000);
    expect(events).toEqual(["page-1", "read", "page-2", "page-3"]);
    await engine.close();
  });

  it("passes the discovered folder scope descriptor into bootstrap", async () => {
    let receivedScope: ScopeDescriptor | null = null;
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const engine = createMailEngine({
      store,
      source: slowBootstrapSource({
        onBootstrap: () => {},
        onEnumerate: () => {},
        scopeId: "folder:inbox",
        scopes: [
          { id: "folder:inbox", kind: "folder", folderId: "inbox-provider-id" },
        ],
        onBeginScope: (scope) => {
          receivedScope = scope;
        },
      }),
      executor: {
        async execute() {
          return { status: "uncertain", receiptId: null };
        },
        async inspect() {
          return { status: "uncertain", receiptId: null };
        },
      },
      runtime: createHostRuntime({ nowMs: () => 1000 }),
    });
    await engine.requestSync(["acc-1"]);
    await engine.runUntil(5000);
    expect(receivedScope).toEqual({
      id: "folder:inbox",
      kind: "folder",
      folderId: "inbox-provider-id",
    });
    await engine.close();
  });

  it("rediscovers scopes after budget expires with only one folder bootstrapped", async () => {
    let now = 1000;
    const receivedScopes: string[] = [];
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "microsoft",
      generation: "g1",
    });
    const engine = createMailEngine({
      store,
      source: slowBootstrapSource({
        onBootstrap: () => {},
        onEnumerate: () => {
          now = 2000;
        },
        scopes: [
          { id: "folder:a", kind: "folder", folderId: "a" },
          { id: "folder:b", kind: "folder", folderId: "b" },
        ],
        onBeginScope: (scope) => {
          receivedScopes.push(scope.id);
        },
      }),
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
    await engine.runUntil(1500);
    expect(receivedScopes).toEqual(["folder:a"]);
    expect((await engine.getDiagnostics("acc-1")).coverage).toEqual([
      expect.objectContaining({ scopeId: "folder:a", metadata: "complete" }),
      expect.objectContaining({ scopeId: "folder:b", metadata: "partial" }),
    ]);

    now = 2000;
    await engine.runUntil(5000);
    expect(receivedScopes).toEqual(["folder:a", "folder:b"]);
    const inspection = await store.inspect();
    expect(inspection.streams.map((stream) => stream.streamId).sort()).toEqual([
      "folder:a",
      "folder:b",
    ]);
    await engine.close();
  });

  it("pauses a bootstrap scan when enumeration returns the same cursor", async () => {
    let enumerated = 0;
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const engine = createMailEngine({
      store,
      source: slowBootstrapSource({
        onBootstrap: () => {},
        onEnumerate: () => {
          enumerated += 1;
        },
        repeatNextPage: true,
      }),
      executor: {
        async execute() {
          return { status: "uncertain", receiptId: null };
        },
        async inspect() {
          return { status: "uncertain", receiptId: null };
        },
      },
      runtime: createHostRuntime({ nowMs: () => 1000 }),
    });
    await engine.requestSync(["acc-1"]);
    await engine.runUntil(5000);
    expect(enumerated).toBe(1);
    const scan = await store.readBootstrapScan({
      session: { accountId: "acc-1", generation: "g1" },
      scopeId: "primary",
    });
    expect(scan).toMatchObject({
      page: "page-1",
      nextAttemptAtMs: 61_000,
      errorCode: "non_advancing_cursor",
    });
    await engine.runUntil(5000);
    expect(enumerated).toBe(1);
    await engine.close();
  });

  it("waits out a paused enumeration instead of retrying it every run", async () => {
    let now = 1000;
    let enumerated = 0;
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const engine = createMailEngine({
      store,
      source: slowBootstrapSource({
        onBootstrap: () => {},
        onEnumerate: () => {
          enumerated += 1;
        },
        pauseFirstEnumerationMs: 15_000,
      }),
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
    await engine.runUntil(5000);
    await engine.runUntil(5000);
    expect(enumerated).toBe(1);

    now = 16_000;
    await engine.runUntil(20_000);
    expect(enumerated).toBe(2);
    expect((await engine.getDiagnostics("acc-1")).coverage).toEqual([
      expect.objectContaining({ scopeId: "primary", metadata: "complete" }),
    ]);
    await engine.close();
  });
});

function slowBootstrapSource(hooks: {
  onBootstrap: () => void;
  onEnumerate: (page: string) => void;
  readChangesOnce?: { status: "reset_required"; scopeId: string };
  body?: { html: string | null; text: string | null };
  scopeId?: string;
  pages?: string[];
  scopes?: ScopeDescriptor[];
  onBeginScope?: (scope: ScopeDescriptor) => void;
  repeatNextPage?: boolean;
  pauseFirstEnumerationMs?: number;
}): MailboxSource {
  const pages = hooks.pages ?? ["page-1"];
  const changesByPage = new Map(
    pages.map((page, index) => [
      page,
      messagePatch(`m${index + 1}`, `c${index + 1}`, ["inbox"]),
    ]),
  );
  const firstChange =
    changesByPage.get(pages[0] ?? "page-1") ??
    messagePatch("m1", "c1", ["inbox"]);
  let resetConsumed = false;
  let enumerationPaused = false;
  let activeScopeId = hooks.scopeId ?? "primary";
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
          scopes: hooks.scopes ?? [
            { id: "primary", kind: "account", folderId: null },
          ],
          nextPage: null,
        },
      };
    },
    async beginBootstrap(input) {
      hooks.onBootstrap();
      hooks.onBeginScope?.(input.scope);
      activeScopeId = input.scope.id;
      return {
        status: "ok",
        value: {
          bootstrapId: "boot",
          enumerationToken: "page-1",
          catchUpFrom: null,
        },
      };
    },
    async enumerate(input) {
      hooks.onEnumerate(input.page);
      if (hooks.pauseFirstEnumerationMs && !enumerationPaused) {
        enumerationPaused = true;
        return {
          status: "paused",
          retryAfterMs: hooks.pauseFirstEnumerationMs,
          reason: "throttled",
        };
      }
      const change =
        changesByPage.get(input.page) ??
        messagePatch("m-missing", "c-missing", ["inbox"]);
      const pageIndex = pages.indexOf(input.page);
      const nextPage = hooks.repeatNextPage
        ? input.page
        : pageIndex >= 0
          ? (pages[pageIndex + 1] ?? null)
          : null;
      const base = {
        bootstrapId: "boot",
        scopeId: activeScopeId,
        changes: [change],
        requiredHydration: [],
        bodies: hooks.body
          ? [
              {
                key: { accountId: "acc-1", messageId: "m1" },
                version: "1",
                html: hooks.body.html,
                text: hooks.body.text,
              },
            ]
          : [],
      };
      return {
        status: "ok",
        value: nextPage
          ? { ...base, nextPage, catchUpFrom: null }
          : {
              ...base,
              nextPage: null,
              catchUpFrom: {
                streamId: activeScopeId,
                generation: "g1",
                checkpoint: "enumerated",
              },
            },
      };
    },
    async readChanges() {
      if (hooks.readChangesOnce && !resetConsumed) {
        resetConsumed = true;
        return hooks.readChangesOnce;
      }
      return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
    },
    async hydrate() {
      return {
        status: "ok",
        value: { changes: [], bodies: [], unresolved: [] },
      };
    },
    async readConversationMembership({ conversation }) {
      return {
        status: "ok",
        value: {
          status: "page",
          page: {
            conversation,
            resolutionId: "res",
            keys: [firstChange.key],
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

function messagePatch(
  messageId: string,
  conversationId: string,
  roles: Array<"inbox" | "draft">,
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
      subject: messageId,
      preview: messageId,
      from: "ada@example.com",
      to: ["me@example.com"],
      cc: [],
      receivedAtMs: 1000,
      read: false,
      starred: false,
      folderId: roles.includes("inbox") ? "inbox" : null,
      labelIds: roles.includes("inbox") ? ["INBOX"] : ["DRAFT"],
      categoryIds: [],
      roles,
      hasAttachments: false,
    },
  };
}
