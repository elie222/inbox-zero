import { describe, expect, it } from "vitest";
import {
  createMailEngine,
  createHostRuntime,
} from "@inboxzero/mail-core/engine";
import type { MailboxSource } from "@inboxzero/mail-core/ports/mailbox-source";
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
        from: { streamId: "primary", generation: "g1", checkpoint: null },
        to: { streamId: "primary", generation: "g1", checkpoint: "old" },
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
        readChangesOnce: { status: "reset_required", scopeId: "primary" },
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
});

function slowBootstrapSource(hooks: {
  onBootstrap: () => void;
  onEnumerate: () => void;
  readChangesOnce?: { status: "reset_required"; scopeId: string };
  body?: { html: string | null; text: string | null };
}): MailboxSource {
  const change = messagePatch("m1", "c1", ["inbox"]);
  let resetConsumed = false;
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
      hooks.onBootstrap();
      return {
        status: "ok",
        value: {
          bootstrapId: "boot",
          enumerationToken: "page-1",
          catchUpFrom: null,
        },
      };
    },
    async enumerate() {
      hooks.onEnumerate();
      return {
        status: "ok",
        value: {
          bootstrapId: "boot",
          scopeId: "primary",
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
          nextPage: null,
          catchUpFrom: {
            streamId: "primary",
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
            keys: [change.key],
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
      return { status: "unavailable" };
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
