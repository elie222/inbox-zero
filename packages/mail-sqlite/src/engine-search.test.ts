import { describe, expect, it } from "vitest";
import {
  createMailEngine,
  createHostRuntime,
} from "@inboxzero/mail-core/engine";
import type { MailboxSource } from "@inboxzero/mail-core/ports/mailbox-source";
import { createNodeSqliteDriver } from "./node-sqlite";
import { createSqliteMailStore } from "./store";

describe("engine search and body hydration", () => {
  it("ingests provider search candidates and makes the body queryable", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const engine = createMailEngine({
      store,
      source: searchSource(),
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
    const search = engine.observeMailbox({
      accountIds: ["acc-1"],
      predicate: {
        kind: "text",
        field: "body",
        value: "unique-body-token",
        match: "phrase",
      },
      order: "newest_first",
      pageSize: 25,
      after: null,
    });
    await engine.runUntil(Date.now() + 2000);
    await waitForReady(search);
    const snapshot = search.getSnapshot();
    expect(snapshot.data?.counts.matchingConversations).toBe(1);
    expect(snapshot.data?.conversations[0]?.subject).toBe("Invoice");
    const conversation = engine.observeConversation(
      { accountId: "acc-1", conversationId: "c-search" },
      { after: null, pageSize: 10 },
    );
    await waitForReady(conversation);
    const body = conversation.getSnapshot().data?.messages[0]?.content;
    expect(body).toMatchObject({
      status: "available",
      text: "unique-body-token",
    });
    await engine.close();
  });
});

async function waitForReady(handle: { getSnapshot: () => { status: string } }) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (handle.getSnapshot().status === "ready") return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

function searchSource(): MailboxSource {
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
      return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
    },
    async readChanges() {
      return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
    },
    async hydrate() {
      return {
        status: "ok",
        value: {
          changes: [
            {
              kind: "message_patch",
              key: { accountId: "acc-1", messageId: "m-search" },
              reference: {
                provider: "google",
                messageId: "m-search",
                conversationId: "c-search",
                version: "1",
              },
              fields: {
                subject: "Invoice",
                preview: "unique-body-token",
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
          bodies: [
            {
              key: { accountId: "acc-1", messageId: "m-search" },
              version: "1",
              html: null,
              text: "unique-body-token",
            },
          ],
          unresolved: [],
        },
      };
    },
    async readConversationMembership() {
      return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
    },
    async search() {
      return {
        status: "ok",
        value: {
          matches: [{ accountId: "acc-1", messageId: "m-search" }],
          nextPage: null,
          semantics: "candidates_require_local_filter",
        },
      };
    },
    async readAttachment() {
      return { status: "paused", retryAfterMs: 0, reason: "unavailable" };
    },
  };
}
