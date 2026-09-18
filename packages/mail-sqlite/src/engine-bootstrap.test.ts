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
});

function slowBootstrapSource(hooks: {
  onBootstrap: () => void;
  onEnumerate: () => void;
}): MailboxSource {
  const change: Extract<ProviderChange, { kind: "message_patch" }> = {
    kind: "message_patch",
    key: { accountId: "acc-1", messageId: "m1" },
    reference: {
      provider: "google",
      messageId: "m1",
      conversationId: "c1",
      version: "1",
    },
    fields: {
      subject: "Hello",
      preview: "Hi",
      from: "ada@example.com",
      to: ["me@example.com"],
      cc: [],
      receivedAtMs: 1000,
      read: false,
      starred: false,
      folderId: "inbox",
      labelIds: ["INBOX"],
      categoryIds: [],
      roles: ["inbox"],
      hasAttachments: false,
    },
  };
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
