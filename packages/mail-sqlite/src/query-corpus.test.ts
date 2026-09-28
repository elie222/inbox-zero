import { describe, expect, it } from "vitest";
import type { ProviderChange } from "@inboxzero/mail-core/sync";
import { createNodeSqliteDriver } from "./node-sqlite";
import { createSqliteMailStore } from "./store";

const LONG_THREAD_SIZE = 120;
const PAGE_SIZE = 25;

describe("query corpora", () => {
  it("keeps combined counts partial until every requested account has coverage", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    try {
      for (const accountId of ["ready", "pending"]) {
        await store.ensureAccount({
          accountId,
          provider: "google",
          generation: "g1",
        });
      }
      await store.applySyncPage({
        ownerId: "owner",
        page: {
          session: { accountId: "ready", generation: "g1" },
          requestId: "completed-account",
          from: { streamId: "primary", generation: "g1", checkpoint: null },
          to: { streamId: "primary", generation: "g1", checkpoint: "1" },
          changes: [],
          requiredHydration: [],
          roundComplete: true,
        },
      });
      const result = await store.readMailboxView({
        accountIds: ["ready", "pending"],
        predicate: { kind: "role", role: "inbox" },
        order: "newest_first",
        pageSize: PAGE_SIZE,
        after: null,
      });
      expect(result.view.coverage).toEqual([
        expect.objectContaining({ accountId: "ready", metadata: "complete" }),
        expect.objectContaining({ accountId: "pending", metadata: "partial" }),
      ]);
      expect(result.view.counts.extent).toBe("local_coverage");
    } finally {
      await store.close();
    }
  });

  it("lists one conversation for a long thread and paginates every message", async () => {
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
        requestId: "long-thread",
        from: { streamId: "primary", generation: "g1", checkpoint: null },
        to: { streamId: "primary", generation: "g1", checkpoint: "1" },
        changes: Array.from({ length: LONG_THREAD_SIZE }, (_, index) =>
          messagePatch({
            accountId: "acc-1",
            messageId: `m-long-${index}`,
            conversationId: "c-long",
            receivedAtMs: index,
            subject: "Long thread",
          }),
        ),
        requiredHydration: [],
        roundComplete: true,
      },
    });

    const started = Date.now();
    const inbox = await store.readMailboxView({
      accountIds: ["acc-1"],
      predicate: { kind: "role", role: "inbox" },
      order: "newest_first",
      pageSize: PAGE_SIZE,
      after: null,
    });
    expect(Date.now() - started).toBeLessThan(5000);
    expect(inbox.view.counts.matchingConversations).toBe(1);
    expect(inbox.view.conversations).toHaveLength(1);
    expect(inbox.view.conversations[0]?.key.conversationId).toBe("c-long");
    expect(inbox.view.conversations[0]?.senders).toHaveLength(LONG_THREAD_SIZE);

    const messageIds: string[] = [];
    let after: string | null = null;
    for (;;) {
      const page = await store.readConversation(
        { accountId: "acc-1", conversationId: "c-long" },
        { after, pageSize: PAGE_SIZE },
      );
      messageIds.push(
        ...page.view.messages.map((message) => message.key.messageId),
      );
      if (!page.view.nextPage) break;
      after = page.view.nextPage;
    }
    expect(messageIds).toEqual(
      Array.from({ length: LONG_THREAD_SIZE }, (_, index) => `m-long-${index}`),
    );
    await store.close();
  });

  it("finds Japanese, Hebrew, and accented phrases without mixing conversations", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const samples = [
      {
        messageId: "m-ja",
        conversationId: "c-ja",
        subject: "請求書",
        text: "添付の請求書を確認してください",
      },
      {
        messageId: "m-he",
        conversationId: "c-he",
        subject: "חשבונית",
        text: "מצורפת חשבונית לחודש",
      },
      {
        messageId: "m-fr",
        conversationId: "c-fr",
        subject: "facture élémentaire",
        text: "Voici la facture élémentaire",
      },
    ];
    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "multilingual",
        from: { streamId: "primary", generation: "g1", checkpoint: null },
        to: { streamId: "primary", generation: "g1", checkpoint: "1" },
        changes: samples.map((sample, index) =>
          messagePatch({
            accountId: "acc-1",
            messageId: sample.messageId,
            conversationId: sample.conversationId,
            receivedAtMs: index,
            subject: sample.subject,
            preview: sample.text,
          }),
        ),
        requiredHydration: [],
        roundComplete: true,
      },
      bodies: samples.map((sample) => ({
        key: { accountId: "acc-1", messageId: sample.messageId },
        version: "1",
        html: null,
        text: sample.text,
      })),
    });

    const japanese = await store.readMailboxView(
      textQuery("acc-1", "subject", "請求書"),
    );
    const hebrew = await store.readMailboxView(
      textQuery("acc-1", "body", "חשבונית"),
    );
    const french = await store.readMailboxView(
      textQuery("acc-1", "any", "élémentaire"),
    );
    expect(conversationIds(japanese)).toEqual(["c-ja"]);
    expect(conversationIds(hebrew)).toEqual(["c-he"]);
    expect(conversationIds(french)).toEqual(["c-fr"]);
    expect(
      conversationIds(
        await store.readMailboxView(textQuery("acc-1", "any", "請求書")),
      ),
    ).toEqual(["c-ja"]);
    expect(
      conversationIds(
        await store.readMailboxView(textQuery("acc-1", "body", "請求書")),
      ),
    ).toEqual(["c-ja"]);
    await store.close();
  });

  it("keeps two accounts' inbox counts isolated and combinable", async () => {
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
    await applyInboxPage(store, "acc-1", [
      messagePatch({
        accountId: "acc-1",
        messageId: "m-a",
        conversationId: "c-a",
        receivedAtMs: 1,
        subject: "A",
      }),
      messagePatch({
        accountId: "acc-1",
        messageId: "m-b",
        conversationId: "c-b",
        receivedAtMs: 2,
        subject: "B",
      }),
    ]);
    await applyInboxPage(store, "acc-2", [
      messagePatch({
        accountId: "acc-2",
        messageId: "m-c",
        conversationId: "c-c",
        receivedAtMs: 3,
        subject: "C",
      }),
    ]);

    expect(
      (await store.readMailboxView(inboxQuery(["acc-1"]))).view.counts
        .matchingConversations,
    ).toBe(2);
    expect(
      (await store.readMailboxView(inboxQuery(["acc-2"]))).view.counts
        .matchingConversations,
    ).toBe(1);
    const combined = await store.readMailboxView(
      inboxQuery(["acc-1", "acc-2"]),
    );
    expect(combined.view.counts.matchingConversations).toBe(3);
    expect(conversationIds(combined).sort()).toEqual(["c-a", "c-b", "c-c"]);
    await store.close();
  });

  it("reads a window of pages in order and continues from its cursor", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    await applyInboxPage(
      store,
      "acc-1",
      [1, 2, 3, 4, 5].map((n) =>
        messagePatch({
          accountId: "acc-1",
          messageId: `m-${n}`,
          conversationId: `c-${n}`,
          receivedAtMs: n,
          subject: `Report ${n}`,
        }),
      ),
    );

    for (const predicate of [
      inboxQuery(["acc-1"]).predicate,
      textQuery("acc-1", "subject", "report").predicate,
    ]) {
      const window = await store.readMailboxWindow(
        { ...inboxQuery(["acc-1"]), predicate, pageSize: 2 },
        2,
      );
      expect(conversationIds(window)).toEqual(["c-5", "c-4", "c-3", "c-2"]);
      expect(window.view.counts.matchingConversations).toBe(5);
      const rest = await store.readMailboxWindow(
        {
          ...inboxQuery(["acc-1"]),
          predicate,
          pageSize: 2,
          after: window.view.nextPage,
        },
        2,
      );
      expect(conversationIds(rest)).toEqual(["c-1"]);
      expect(rest.view.nextPage).toBeNull();
    }
    await store.close();
  });
});

function inboxQuery(accountIds: string[]) {
  return {
    accountIds,
    predicate: { kind: "role" as const, role: "inbox" as const },
    order: "newest_first" as const,
    pageSize: PAGE_SIZE,
    after: null,
  };
}

function textQuery(
  accountId: string,
  field: "any" | "subject" | "body",
  value: string,
) {
  return {
    accountIds: [accountId],
    predicate: {
      kind: "text" as const,
      field,
      value,
      match: "phrase" as const,
    },
    order: "newest_first" as const,
    pageSize: PAGE_SIZE,
    after: null,
  };
}

function conversationIds(result: {
  view: { conversations: Array<{ key: { conversationId: string } }> };
}) {
  return result.view.conversations.map(
    (conversation) => conversation.key.conversationId,
  );
}

async function applyInboxPage(
  store: Awaited<ReturnType<typeof createSqliteMailStore>>,
  accountId: string,
  changes: Extract<ProviderChange, { kind: "message_patch" }>[],
) {
  await store.applySyncPage({
    ownerId: "owner",
    page: {
      session: { accountId, generation: "g1" },
      requestId: `boot-${accountId}`,
      from: { streamId: "primary", generation: "g1", checkpoint: null },
      to: { streamId: "primary", generation: "g1", checkpoint: "1" },
      changes,
      requiredHydration: [],
      roundComplete: true,
    },
  });
}

function messagePatch(input: {
  accountId: string;
  messageId: string;
  conversationId: string;
  receivedAtMs: number;
  subject: string;
  preview?: string;
}): Extract<ProviderChange, { kind: "message_patch" }> {
  return {
    kind: "message_patch",
    key: { accountId: input.accountId, messageId: input.messageId },
    reference: {
      provider: "google",
      messageId: input.messageId,
      conversationId: input.conversationId,
      version: "1",
    },
    fields: {
      subject: input.subject,
      preview: input.preview ?? input.subject,
      from: `${input.accountId}@example.com`,
      to: ["me@example.com"],
      cc: [],
      receivedAtMs: input.receivedAtMs,
      read: false,
      starred: false,
      folderId: "inbox",
      labelIds: ["INBOX"],
      categoryIds: [],
      roles: ["inbox"],
      hasAttachments: false,
    },
  };
}
