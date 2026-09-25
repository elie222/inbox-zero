import { describe, expect, it } from "vitest";
import type { MailStore } from "@inboxzero/mail-core/ports/mail-store";
import type { ProviderChange } from "@inboxzero/mail-core/sync";
import type { SqliteDriver } from "./driver";
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

  it("reads legacy rows during the backfill and resumes it after a reopen", async () => {
    const driver = createNodeSqliteDriver();
    const first = await mailbox(driver);
    const messages = Array.from({ length: 250 }, (_, index) => ({
      messageId: `m${String(index).padStart(3, "0")}`,
      html: index % 2 ? `${HTML}<p>${index}</p>` : null,
      text: `Body ${index}`,
    }));
    await applyBodies(first.store, messages);
    await storeAsLegacyText(driver, messages);
    const legacy = Object.fromEntries(
      messages.map((body) => [
        body.messageId,
        { html: body.html, text: body.text },
      ]),
    );
    const compressed = Object.fromEntries(
      messages.map((body) => [
        body.messageId,
        { html: body.html, text: body.html ? null : body.text },
      ]),
    );

    const reopened = await createSqliteMailStore(driver, {
      bodyCodec: nodeBodyCodec,
    });
    expect(await readBodies(reopened)).toEqual(legacy);
    expect((await reopened.compressBodyBacklog()).remaining).toBe(true);
    const midway = await readBodies(reopened);
    expect(Object.keys(midway)).toEqual(Object.keys(legacy));
    for (const [id, body] of Object.entries(midway)) {
      expect([legacy[id], compressed[id]]).toContainEqual(body);
    }

    const resumed = await createSqliteMailStore(driver, {
      bodyCodec: nodeBodyCodec,
    });
    while ((await resumed.compressBodyBacklog()).remaining) {
      // keep compressing
    }

    const columns = await storedColumns(driver);
    expect(
      columns.filter((row) => row.html === "text" || row.text === "text"),
    ).toEqual([]);
    expect(
      columns.filter((row) => row.html === "blob" && row.text !== "null"),
    ).toEqual([]);
    expect(await readBodies(resumed)).toEqual(compressed);

    await driver.write((tx) =>
      tx.execute("UPDATE message_content SET text = 'late legacy row'"),
    );
    const finished = await createSqliteMailStore(driver, {
      bodyCodec: nodeBodyCodec,
    });
    expect(await finished.compressBodyBacklog()).toEqual({ remaining: false });
    await finished.close();
  });

  it("keeps body terms searchable when the index is rebuilt from legacy and compressed rows", async () => {
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

    await rebuildSearchIndex(driver);
    expect(await searchBody(driver, "zephyr")).toEqual(["c-html"]);
    expect(await searchBody(driver, "quokka")).toEqual(["c-plain"]);

    const reopened = await createSqliteMailStore(driver, {
      bodyCodec: nodeBodyCodec,
    });
    while ((await reopened.compressBodyBacklog()).remaining) {
      // keep compressing
    }
    await rebuildSearchIndex(driver);
    expect(await searchBody(driver, "zephyr")).toEqual(["c-html"]);
    expect(await searchBody(driver, "quokka")).toEqual(["c-plain"]);
    await reopened.close();
  });
});

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
    { after: null, pageSize: 500 },
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
