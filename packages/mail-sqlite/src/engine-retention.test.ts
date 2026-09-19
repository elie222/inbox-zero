import { describe, expect, it } from "vitest";
import {
  createMailEngine,
  createHostRuntime,
} from "@inboxzero/mail-core/engine";
import type { MailboxSource } from "@inboxzero/mail-core/ports/mailbox-source";
import { createNodeSqliteDriver } from "./node-sqlite";
import { createSqliteMailStore } from "./store";

describe("engine storage pressure", () => {
  it("keeps hydrated bodies when the host is not under storage pressure", async () => {
    const store = await seedHydratedMailbox();
    const engine = createMailEngine({
      store,
      source: idleSource(),
      executor: noopExecutor(),
      runtime: createHostRuntime(),
    });
    await engine.runUntil(Date.now() + 200);
    expect(await messageBody(store)).toMatchObject({
      status: "available",
      text: "replaceable",
    });
    expect(
      await store.readDraft({ accountId: "acc-1", draftId: "d1" }),
    ).toMatchObject({
      status: "found",
      content: { subject: "Keep me" },
    });
    await engine.close();
  });

  it("evicts replaceable bodies once when the host reports storage pressure", async () => {
    const store = await seedHydratedMailbox();
    const engine = createMailEngine({
      store,
      source: idleSource(),
      executor: noopExecutor(),
      runtime: createHostRuntime({ storagePressure: () => true }),
    });
    await engine.runUntil(Date.now() + 200);
    expect(await messageBody(store)).toEqual({ status: "not_requested" });
    expect(
      await store.readDraft({ accountId: "acc-1", draftId: "d1" }),
    ).toMatchObject({
      status: "found",
      content: { subject: "Keep me" },
    });
    const inbox = await store.readMailboxView({
      accountIds: ["acc-1"],
      predicate: { kind: "role", role: "inbox" },
      order: "newest_first",
      pageSize: 25,
      after: null,
    });
    expect(inbox.view.counts.matchingConversations).toBe(1);
    await engine.close();
  });

  it("does not evict a later hydrate while storage pressure stays true", async () => {
    const store = await seedHydratedMailbox();
    const engine = createMailEngine({
      store,
      source: idleSource(),
      executor: noopExecutor(),
      runtime: createHostRuntime({ storagePressure: () => true }),
    });
    await engine.runUntil(Date.now() + 200);
    expect(await messageBody(store)).toEqual({ status: "not_requested" });
    expect(
      await store.applyHydration({
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "body-again",
        changes: [],
        bodies: [
          {
            key: { accountId: "acc-1", messageId: "m1" },
            version: "1",
            html: "<p>replaceable</p>",
            text: "replaceable",
          },
        ],
      }),
    ).toMatchObject({ status: "committed" });
    expect(await messageBody(store)).toMatchObject({
      status: "available",
      text: "replaceable",
    });
    await engine.runUntil(Date.now() + 200);
    expect(await messageBody(store)).toMatchObject({
      status: "available",
      text: "replaceable",
    });
    await engine.close();
  });
});

async function seedHydratedMailbox() {
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
            subject: "c1",
            preview: "m1",
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
  expect(
    await store.applyHydration({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "body",
      changes: [],
      bodies: [
        {
          key: { accountId: "acc-1", messageId: "m1" },
          version: "1",
          html: "<p>replaceable</p>",
          text: "replaceable",
        },
      ],
    }),
  ).toMatchObject({ status: "committed" });
  expect(
    await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d1" },
      expectedRevision: null,
      content: {
        to: ["ada@example.com"],
        cc: [],
        bcc: [],
        subject: "Keep me",
        editableHtml: "<p>Keep me</p>",
        quotedHtml: "",
        attachmentIds: [],
      },
    }),
  ).toMatchObject({ status: "saved" });
  return store;
}

async function messageBody(
  store: Awaited<ReturnType<typeof seedHydratedMailbox>>,
) {
  const conversation = await store.readConversation(
    { accountId: "acc-1", conversationId: "c1" },
    { after: null, pageSize: 10 },
  );
  return conversation.view.messages[0]?.content;
}

function noopExecutor() {
  return {
    async execute() {
      return { status: "uncertain" as const, receiptId: null };
    },
    async inspect() {
      return { status: "uncertain" as const, receiptId: null };
    },
  };
}

function idleSource(): MailboxSource {
  const paused = {
    status: "paused" as const,
    retryAfterMs: 0,
    reason: "unavailable" as const,
  };
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
      return paused;
    },
    async readChanges() {
      return paused;
    },
    async hydrate() {
      return paused;
    },
    async readConversationMembership() {
      return paused;
    },
    async search() {
      return { status: "unsupported" };
    },
    async readAttachment() {
      return paused;
    },
  };
}
