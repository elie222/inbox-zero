import { describe, expect, it } from "vitest";
import {
  createMailEngine,
  createHostRuntime,
} from "@inboxzero/mail-core/engine";
import type { AssistantStateSource } from "@inboxzero/mail-core/ports/assistant-source";
import type { MailboxSource } from "@inboxzero/mail-core/ports/mailbox-source";
import { createNodeSqliteDriver } from "./node-sqlite";
import { createSqliteMailStore } from "./store";

describe("engine assistant catch-up", () => {
  it("ingests assistant archive metadata after the client was stopped", async () => {
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
          {
            kind: "message_patch",
            key: { accountId: "acc-1", messageId: "m1" },
            reference: {
              provider: "google",
              messageId: "m1",
              conversationId: "c1",
              version: "1",
            },
            fields: {
              subject: "Hi",
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
          },
        ],
        requiredHydration: [],
        roundComplete: true,
      },
    });
    const engine = createMailEngine({
      store,
      source: idleSource(),
      executor: {
        async execute() {
          return { status: "uncertain", receiptId: null };
        },
        async inspect() {
          return { status: "uncertain", receiptId: null };
        },
      },
      runtime: createHostRuntime(),
      assistant: archiveAssistant(),
    });
    await engine.runUntil(Date.now() + 1000);
    const inspection = await store.inspect();
    const message = inspection.messages.find((item) => item.messageId === "m1");
    expect(message?.confirmed.roles.includes("inbox")).toBe(false);
    expect(inspection.accounts[0]?.assistantCursor).toBe("next");
    await engine.close();
  });
});

function idleSource(): MailboxSource {
  return {
    async describe() {
      return {
        status: "ok",
        value: {
          strategy: "account_history",
          supportedChanges: ["archive"],
          maxPageSize: 10,
          maxHydrationBatch: 10,
        },
      };
    },
    async discoverScopes() {
      return { status: "ok", value: { scopes: [], nextPage: null } };
    },
    async beginBootstrap() {
      return {
        status: "ok",
        value: { bootstrapId: "x", enumerationToken: "{}", catchUpFrom: null },
      };
    },
    async enumerate() {
      return { status: "reset_required", scopeId: "primary" };
    },
    async readChanges() {
      return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
    },
    async hydrate() {
      return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
    },
    async readConversationMembership() {
      return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
    },
    async search() {
      return { status: "unsupported" };
    },
    async readAttachment() {
      return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
    },
  };
}

function archiveAssistant(): AssistantStateSource {
  return {
    async read() {
      return {
        status: "ok",
        page: {
          session: { accountId: "acc-1", generation: "g1" },
          cursor: null,
          nextCursor: "next",
          reset: false,
          entries: [
            {
              id: "a1",
              revision: "1",
              messageId: "m1",
              conversationId: "c1",
              kind: "ARCHIVE",
              payload: {},
            },
          ],
        },
      };
    },
  };
}
