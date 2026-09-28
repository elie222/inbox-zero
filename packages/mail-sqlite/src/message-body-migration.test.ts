import { describe, expect, it } from "vitest";
import type { MailStore } from "@inboxzero/mail-core/ports/mail-store";
import type { ProviderChange } from "@inboxzero/mail-core/sync";
import type { SqliteDriver } from "./driver";
import { compressLegacyBodies } from "./message-body-migration";
import { createNodeSqliteDriver, nodeBodyCodec } from "./node-sqlite";
import { createSqliteMailStore } from "./store";

const ACCOUNT = "acc-1";
const HTML = `<div>${"<p>Product update with long newsletter copy</p>".repeat(40)}</div>`;

describe("compressed message bodies", () => {
  it("stores bodies compressed and drops the text part of HTML messages", async () => {
    const { driver, store } = await mailbox();
    await applyBodies(store, [
      { messageId: "html", html: HTML, text: "Product update" },
      { messageId: "plain", html: null, text: "Plain note" },
    ]);

    expect(await storedColumns(driver)).toEqual([
      { message_id: "html", html: "blob", text: "null" },
      { message_id: "plain", html: "null", text: "blob" },
    ]);
    expect(await readBodies(store)).toEqual({
      html: { html: HTML, text: null },
      plain: { html: null, text: "Plain note" },
    });
    await store.close();
  });

  it("converts legacy rows on open and finishes an interrupted run on the next open", async () => {
    const driver = createNodeSqliteDriver();
    const { store } = await mailbox(driver);
    const messages = Array.from({ length: 1200 }, (_, index) => ({
      messageId: `m${String(index).padStart(4, "0")}`,
      html: index % 2 ? `${HTML}<p>${index}</p>` : null,
      text: `Body ${index}`,
    }));
    await applyBodies(store, messages);
    await storeAsLegacyText(driver, messages);
    await driver.write((tx) => compressLegacyBodies(tx, nodeBodyCodec));
    expect(await migrationRecorded(driver)).toBe(false);

    const reopened = await createSqliteMailStore(driver, {
      bodyCodec: nodeBodyCodec,
    });

    expect(await migrationRecorded(driver)).toBe(true);
    const columns = await storedColumns(driver);
    expect(
      columns.filter((row) => row.html === "text" || row.text === "text"),
    ).toEqual([]);
    expect(await readBodies(reopened)).toEqual(
      Object.fromEntries(
        messages.map((body) => [
          body.messageId,
          { html: body.html, text: body.html ? null : body.text },
        ]),
      ),
    );
    await reopened.close();
  });

  it("finds body terms after legacy rows are converted and re-indexed", async () => {
    const { driver, store } = await mailbox();
    const messages = [
      {
        messageId: "html",
        conversationId: "c-html",
        html: `${HTML}<p>zephyr</p>`,
        text: "zephyr",
      },
      {
        messageId: "plain",
        conversationId: "c-plain",
        html: null,
        text: "quokka sighting",
      },
    ];
    await applyBodies(store, messages);
    await storeAsLegacyText(driver, messages);
    await createSqliteMailStore(driver, { bodyCodec: nodeBodyCodec });

    await rebuildSearchIndex(driver);
    expect(await searchBody(driver, "zephyr")).toEqual(["c-html"]);
    expect(await searchBody(driver, "quokka")).toEqual(["c-plain"]);
    await store.close();
  });
});

async function migrationRecorded(driver: SqliteDriver) {
  const rows = await driver.read((tx) =>
    tx.query("SELECT 1 FROM schema_migrations WHERE id = 8"),
  );
  return rows.length > 0;
}

async function rebuildSearchIndex(driver: SqliteDriver) {
  await driver.write(async (tx) => {
    await tx.exec("INSERT INTO message_fts(message_fts) VALUES ('delete-all')");
    await tx.exec("DELETE FROM message_fts_keys");
  });
  const store = await createSqliteMailStore(driver, {
    bodyCodec: nodeBodyCodec,
  });
  while ((await store.indexSearchBacklog()).remaining) {
    // keep indexing
  }
}

async function searchBody(driver: SqliteDriver, value: string) {
  const store = await createSqliteMailStore(driver, {
    bodyCodec: nodeBodyCodec,
  });
  const { view } = await store.readMailboxView({
    accountIds: [ACCOUNT],
    predicate: { kind: "text", field: "body", value, match: "term" },
    order: "newest_first",
    pageSize: 10,
    after: null,
  });
  return view.conversations.map((row) => row.key.conversationId);
}

type Body = {
  messageId: string;
  conversationId?: string;
  html: string | null;
  text: string | null;
};

async function mailbox(driver: SqliteDriver = createNodeSqliteDriver()) {
  const store = await createSqliteMailStore(driver, {
    bodyCodec: nodeBodyCodec,
  });
  await store.ensureAccount({
    accountId: ACCOUNT,
    provider: "google",
    generation: "g1",
  });
  return { driver, store };
}

async function applyBodies(store: MailStore, bodies: Body[]) {
  await store.applySyncPage({
    ownerId: "owner",
    page: {
      session: { accountId: ACCOUNT, generation: "g1" },
      requestId: "bootstrap",
      from: { streamId: "primary", generation: "g1", checkpoint: null },
      to: { streamId: "primary", generation: "g1", checkpoint: "1" },
      changes: bodies.map((body) =>
        messagePatch(body.messageId, body.conversationId),
      ),
      requiredHydration: [],
      roundComplete: true,
    },
    bodies: bodies.map((body) => ({
      key: { accountId: ACCOUNT, messageId: body.messageId },
      version: "1",
      html: body.html,
      text: body.text,
    })),
  });
}

// Rewrites rows the way builds before compression stored them: plain TEXT,
// with the text part kept next to HTML.
async function storeAsLegacyText(driver: SqliteDriver, bodies: Body[]) {
  await driver.write(async (tx) => {
    for (const body of bodies) {
      await tx.execute(
        "UPDATE message_content SET html = ?, text = ? WHERE account_id = ? AND message_id = ?",
        [body.html, body.text, ACCOUNT, body.messageId],
      );
    }
    await tx.execute("DELETE FROM schema_migrations WHERE id = 8");
  });
}

async function readBodies(store: MailStore) {
  const bodies: Record<string, { html: string | null; text: string | null }> =
    {};
  const { view } = await store.readConversation(
    { accountId: ACCOUNT, conversationId: "c1" },
    { after: null, pageSize: 2000 },
  );
  for (const message of view.messages) {
    if (message.content.status !== "available") continue;
    bodies[message.key.messageId] = {
      html: message.content.html,
      text: message.content.text,
    };
  }
  return bodies;
}

async function storedColumns(driver: SqliteDriver) {
  return driver.read((tx) =>
    tx.query(
      "SELECT message_id, typeof(html) AS html, typeof(text) AS text FROM message_content ORDER BY message_id",
    ),
  );
}

function messagePatch(
  messageId: string,
  conversationId = "c1",
): Extract<ProviderChange, { kind: "message_patch" }> {
  return {
    kind: "message_patch",
    key: { accountId: ACCOUNT, messageId },
    reference: {
      provider: "google",
      messageId,
      conversationId,
      version: "1",
    },
    fields: {
      subject: "Update",
      preview: "Preview",
      from: "sender@example.com",
      to: ["me@example.com"],
      cc: [],
      receivedAtMs: 1000,
      read: false,
      starred: false,
      folderId: "inbox",
      inboxSection: null,
      labelIds: ["INBOX"],
      categoryIds: [],
      roles: ["inbox"],
      hasAttachments: false,
    },
  };
}
