import { describe, expect, it } from "vitest";
import type { MailStore } from "@inboxzero/mail-core/ports/mail-store";
import type { MailPredicate } from "@inboxzero/mail-core/queries";
import type { ProviderChange } from "@inboxzero/mail-core/sync";
import type { SqliteDriver } from "./driver";
import { createNodeSqliteDriver } from "./node-sqlite";
import { createSqliteMailStore } from "./store";

const MESSAGES = [
  {
    id: "html",
    subject: "Weekly digest",
    from: "Billing <billing@acme.example>",
    read: false,
    text: null,
    html: `<html><head><style>.font-large { color: red }</style></head><body>
      <table style="font-family:Arial"><tr><td>Quarterly <b>invoice</b> attached</td></tr></table>
      </body></html>`,
  },
  {
    id: "text",
    subject: "Invoice reminder",
    from: "ada@example.com",
    read: true,
    text: "Payment for the quarterly review",
    html: null,
  },
  {
    id: "lunch",
    subject: "Lunch",
    from: "grace@example.com",
    read: false,
    text: "Tacos on Friday",
    html: null,
  },
  {
    id: "bare",
    subject: "Parking notice",
    from: "facilities@example.com",
    read: false,
    text: null,
    html: null,
  },
];

describe("local text search", () => {
  it("matches words from an HTML-only body but not its markup", async () => {
    const { store, close } = await searchableMailbox();

    expect(await search(store, text("any", "attached"))).toEqual(["html"]);
    expect(await search(store, text("any", "font"))).toEqual([]);
    expect(await search(store, text("any", "table"))).toEqual([]);
    expect(await search(store, text("any", "red"))).toEqual([]);
    await close();
  });

  it("matches words as they are typed and requires every term", async () => {
    const { store, close } = await searchableMailbox();

    expect(await search(store, text("any", "quar"))).toEqual(["html", "text"]);
    expect(await search(store, text("any", "invoice attach"))).toEqual([
      "html",
    ]);
    expect(await search(store, text("any", "quarterly tacos"))).toEqual([]);
    await close();
  });

  it("reads search syntax and punctuation in the input as plain text", async () => {
    const { store, close } = await searchableMailbox();

    for (const value of [
      '"',
      '"tacos',
      "tacos OR",
      "NOT tacos",
      "subject:lunch",
      "body : tacos",
      "*",
      "(",
      "^tacos",
      "NEAR(tacos)",
      "tacos -friday",
      "...",
    ]) {
      await expect(search(store, text("any", value))).resolves.toBeDefined();
    }
    expect(await search(store, text("any", "tacos!"))).toEqual(["lunch"]);
    expect(await search(store, text("any", '"tacos"'))).toEqual(["lunch"]);
    expect(await search(store, text("any", "..."))).toEqual([]);
    await close();
  });

  it("keeps field filters to their field", async () => {
    const { store, close } = await searchableMailbox();

    expect(await search(store, text("subject", "invoice"))).toEqual(["text"]);
    expect(await search(store, text("body", "invoice"))).toEqual(["html"]);
    expect(
      await search(store, {
        kind: "all",
        predicates: [
          {
            kind: "address",
            field: "from",
            value: "billing@acme.example",
            match: "address",
          },
          text("any", "quarterly"),
        ],
      }),
    ).toEqual(["html"]);
    expect(
      await search(store, {
        kind: "not",
        predicate: text("any", "quarterly"),
      }),
    ).toEqual(["bare", "lunch"]);
    await close();
  });

  it("finds mail synced without a body by its current subject", async () => {
    const { store, close } = await searchableMailbox();
    expect(await search(store, text("any", "parking"))).toEqual(["bare"]);

    const bare = MESSAGES.findIndex((message) => message.id === "bare");
    const renamed = messagePatch(
      { ...MESSAGES[bare], subject: "Garage notice" },
      bare,
    );
    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "rename",
        from: { streamId: "primary", generation: "g1", checkpoint: "1" },
        to: { streamId: "primary", generation: "g1", checkpoint: "2" },
        changes: [
          { ...renamed, reference: { ...renamed.reference, version: "2" } },
        ],
        requiredHydration: [],
        roundComplete: true,
      },
    });

    expect(await search(store, text("any", "garage"))).toEqual(["bare"]);
    expect(await search(store, text("any", "parking"))).toEqual([]);
    await close();
  });

  it("counts matching and unread conversations for a search", async () => {
    const { store, close } = await searchableMailbox();

    const { view } = await store.readMailboxView(query(text("any", "quar")));
    expect(view.counts).toMatchObject({
      matchingConversations: 2,
      unreadConversations: 1,
    });
    await close();
  });

  it("finds messages the index has not reached yet by subject, and by body once indexed", async () => {
    const { driver, close } = await searchableMailbox();
    await driver.write(async (tx) => {
      await tx.exec(
        "INSERT INTO message_fts(message_fts) VALUES ('delete-all')",
      );
      await tx.exec("DELETE FROM message_fts_keys");
    });
    const reopened = await createSqliteMailStore(driver);

    expect(await search(reopened, text("any", "lunch"))).toEqual(["lunch"]);
    expect(await search(reopened, text("any", "tacos"))).toEqual([]);
    expect(await search(reopened, text("subject", "parking"))).toEqual([
      "bare",
    ]);
    expect(await search(reopened, text("any", "attached"))).toEqual([]);

    await drainBacklog(reopened);
    expect(await search(reopened, text("any", "attached"))).toEqual(["html"]);
    expect(await search(reopened, text("any", "parking"))).toEqual(["bare"]);
    expect(await search(reopened, text("any", "tacos"))).toEqual(["lunch"]);
    await close();
  });

  it("keeps finding mail by subject after bodies are evicted", async () => {
    const { store, close } = await searchableMailbox();

    await store.evictReplaceableContent();
    expect(await search(store, text("any", "digest"))).toEqual(["html"]);
    await drainBacklog(store);
    expect(await search(store, text("any", "digest"))).toEqual(["html"]);
    expect(await search(store, text("any", "attached"))).toEqual([]);
    await close();
  });
});

function text(field: "any" | "subject" | "body", value: string): MailPredicate {
  return { kind: "text", field, value, match: "term" };
}

async function search(store: MailStore, predicate: MailPredicate) {
  const result = await store.readMailboxView(query(predicate));
  return result.view.conversations
    .map((conversation) => conversation.key.conversationId)
    .sort();
}

function query(predicate: MailPredicate) {
  return {
    accountIds: ["acc-1"],
    predicate,
    order: "newest_first" as const,
    pageSize: 25,
    after: null,
  };
}

async function searchableMailbox(): Promise<{
  store: MailStore;
  driver: SqliteDriver;
  close: () => Promise<void>;
}> {
  const driver = createNodeSqliteDriver();
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
      changes: MESSAGES.map((message, index) => messagePatch(message, index)),
      requiredHydration: [],
      roundComplete: true,
    },
    bodies: MESSAGES.filter(
      (message) => message.text !== null || message.html !== null,
    ).map((message) => ({
      key: { accountId: "acc-1", messageId: message.id },
      version: "1",
      text: message.text,
      html: message.html,
    })),
  });
  await drainBacklog(store);
  return { store, driver, close: () => store.close() };
}

async function drainBacklog(store: MailStore) {
  while ((await store.indexSearchBacklog()).remaining) {
    // keep indexing
  }
}

function messagePatch(
  message: (typeof MESSAGES)[number],
  index: number,
): Extract<ProviderChange, { kind: "message_patch" }> {
  return {
    kind: "message_patch",
    key: { accountId: "acc-1", messageId: message.id },
    reference: {
      provider: "google",
      messageId: message.id,
      conversationId: message.id,
      version: "1",
    },
    fields: {
      subject: message.subject,
      preview: "",
      from: message.from,
      to: ["me@example.com"],
      cc: [],
      receivedAtMs: index,
      read: message.read,
      starred: false,
      folderId: "inbox",
      labelIds: ["INBOX"],
      categoryIds: [],
      roles: ["inbox"],
      hasAttachments: false,
    },
  };
}
