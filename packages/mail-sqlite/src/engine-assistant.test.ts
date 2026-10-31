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
  it("records assistant archive metadata after the client was stopped", async () => {
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
      assistant: archiveAssistant("m1", "c1"),
    });
    await engine.runUntil(Date.now() + 1000);
    const inspection = await store.inspect();
    const message = inspection.messages.find((item) => item.messageId === "m1");
    expect(message?.confirmed.roles.includes("inbox")).toBe(true);
    expect(inspection.accounts[0]?.assistantCursor).toBe("next");
    expect(inspection.assistantEntries).toEqual([
      expect.objectContaining({
        accountId: "acc-1",
        id: "a1",
        revision: "1",
        messageId: "m1",
        conversationId: "c1",
        kind: "ARCHIVE",
      }),
    ]);
    await engine.close();
  });

  it("records assistant archive catch-up while user commands are queue_full", async () => {
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
    const queued = await store.admitMetadata({
      accountId: "acc-1",
      commandId: "archive-user",
      targets: [{ accountId: "acc-1", messageId: "m1" }],
      change: { kind: "archive" },
    });
    expect(queued.status).toBe("queued");
    const blocked = await store.admitMetadata({
      accountId: "acc-1",
      commandId: "archive-later",
      targets: [{ accountId: "acc-1", messageId: "m2" }],
      change: { kind: "archive" },
    });
    expect(blocked).toEqual({ status: "rejected", code: "queue_full" });

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
      assistant: archiveAssistant("m2", "c2"),
    });
    await engine.runUntil(Date.now() + 1000);
    const inspection = await store.inspect();
    const assistantTarget = inspection.messages.find(
      (item) => item.messageId === "m2",
    );
    expect(assistantTarget?.confirmed.roles.includes("inbox")).toBe(true);
    expect(inspection.accounts[0]?.assistantCursor).toBe("next");
    expect(inspection.assistantEntries).toEqual([
      expect.objectContaining({
        accountId: "acc-1",
        id: "a1",
        revision: "1",
        messageId: "m2",
        conversationId: "c2",
        kind: "ARCHIVE",
      }),
    ]);
    expect(inspection.operations).toEqual([
      expect.objectContaining({
        key: { accountId: "acc-1", operationId: "archive-user" },
        status: "uncertain",
      }),
    ]);
    const stillBlocked = await store.admitMetadata({
      accountId: "acc-1",
      commandId: "archive-later",
      targets: [{ accountId: "acc-1", messageId: "m2" }],
      change: { kind: "archive" },
    });
    expect(stillBlocked).toEqual({ status: "rejected", code: "queue_full" });
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

function archiveAssistant(
  messageId = "m1",
  conversationId = "c1",
): AssistantStateSource {
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
              messageId,
              conversationId,
              kind: "ARCHIVE",
              payload: {},
            },
          ],
        },
      };
    },
  };
}

function messagePatch(
  messageId: string,
  conversationId: string,
  receivedAtMs: number,
  roles: Array<"inbox" | "sent" | "draft" | "trash" | "spam">,
) {
  return {
    kind: "message_patch" as const,
    key: { accountId: "acc-1", messageId },
    reference: {
      provider: "google" as const,
      messageId,
      conversationId,
      version: "1",
    },
    fields: {
      subject: "Hi",
      preview: "Hi",
      from: "ada@example.com",
      to: ["me@example.com"],
      cc: [],
      receivedAtMs,
      read: false,
      starred: false,
      folderId: "inbox",
      labelIds: roles.includes("inbox") ? ["INBOX"] : [],
      categoryIds: [],
      roles,
      hasAttachments: false,
    },
  };
}
