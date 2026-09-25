import { describe, expect, it } from "vitest";
import type { MailPredicate } from "@inboxzero/mail-core/queries";
import type { ProviderChange } from "@inboxzero/mail-core/sync";
import { createNodeSqliteDriver } from "./node-sqlite";
import { createSqliteMailStore } from "./store";

const MESSAGES = [
  {
    id: "html",
    subject: "Weekly digest",
    from: "Billing <billing@acme.example>",
    text: null,
    html: `<html><head><style>.font-large { color: red }</style></head><body>
      <table style="font-family:Arial"><tr><td>Quarterly <b>invoice</b> attached</td></tr></table>
      </body></html>`,
  },
  {
    id: "text",
    subject: "Invoice reminder",
    from: "ada@example.com",
    text: "Payment for the quarterly review",
    html: null,
  },
  {
    id: "lunch",
    subject: "Lunch",
    from: "grace@example.com",
    text: "Tacos on Friday",
    html: null,
  },
];

describe("local text search", () => {
  it("matches words from an HTML-only body but not its markup", async () => {
    const { search, close } = await searchableMailbox();

    expect(await search(text("any", "attached"))).toEqual(["html"]);
    expect(await search(text("any", "font"))).toEqual([]);
    expect(await search(text("any", "table"))).toEqual([]);
    expect(await search(text("any", "red"))).toEqual([]);
    await close();
  });

  it("matches words as they are typed and requires every term", async () => {
    const { search, close } = await searchableMailbox();

    expect(await search(text("any", "quar"))).toEqual(["html", "text"]);
    expect(await search(text("any", "invoice attach"))).toEqual(["html"]);
    expect(await search(text("any", "quarterly tacos"))).toEqual([]);
    await close();
  });

  it("reads search syntax and punctuation in the input as plain text", async () => {
    const { search, close } = await searchableMailbox();

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
      await expect(search(text("any", value))).resolves.toBeDefined();
    }
    expect(await search(text("any", "tacos!"))).toEqual(["lunch"]);
    expect(await search(text("any", '"tacos"'))).toEqual(["lunch"]);
    expect(await search(text("any", "..."))).toEqual([]);
    await close();
  });

  it("keeps field filters to their field", async () => {
    const { search, close } = await searchableMailbox();

    expect(await search(text("subject", "invoice"))).toEqual(["text"]);
    expect(await search(text("body", "invoice"))).toEqual(["html"]);
    expect(
      await search({
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
    await close();
  });

  it("finds messages the index has not reached yet by their subject, and their body once indexed", async () => {
    const { store, driver, search, close } = await searchableMailbox();
    await driver.write(async (tx) => {
      await tx.exec(
        "INSERT INTO message_fts(message_fts) VALUES ('delete-all')",
      );
      await tx.exec("DELETE FROM message_fts_keys");
    });

    expect(await search(text("subject", "digest"))).toEqual(["html"]);
    expect(await search(text("any", "lunch"))).toEqual(["lunch"]);
    expect(await search(text("any", "tacos"))).toEqual([]);
    expect(await search(text("any", "attached"))).toEqual([]);

    while ((await store.indexSearchBacklog()).remaining) {
      // keep indexing
    }
    expect(await search(text("any", "tacos"))).toEqual(["lunch"]);
    expect(await search(text("any", "attached"))).toEqual(["html"]);
    await close();
  });
});

function text(field: "any" | "subject" | "body", value: string): MailPredicate {
  return { kind: "text", field, value, match: "term" };
}

async function searchableMailbox() {
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
    bodies: MESSAGES.map((message) => ({
      key: { accountId: "acc-1", messageId: message.id },
      version: "1",
      text: message.text,
      html: message.html,
    })),
  });
  async function search(predicate: MailPredicate) {
    const result = await store.readMailboxView({
      accountIds: ["acc-1"],
      predicate,
      order: "newest_first",
      pageSize: 25,
      after: null,
    });
    return result.view.conversations
      .map((conversation) => conversation.key.conversationId)
      .sort();
  }
  return { store, driver, search, close: () => store.close() };
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
