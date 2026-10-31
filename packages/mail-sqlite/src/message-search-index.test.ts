import { describe, expect, it } from "vitest";
import type { MailStore } from "@inboxzero/mail-core/ports/mail-store";
import type { ProviderChange } from "@inboxzero/mail-core/sync";
import type { SqlTransaction, SqliteDriver } from "./driver";
import {
  deleteAccountSearchIndex,
  indexMessageContent,
  indexSearchBacklog,
} from "./message-search-index";
import { decodeMessageBody } from "./message-body-codec";
import { createNodeSqliteDriver, nodeBodyCodec } from "./node-sqlite";
import { createSqliteMailStore } from "./store";

const RAW_HTML_FTS_SQL = `
CREATE VIRTUAL TABLE message_fts USING fts5(
  subject,
  preview,
  from_address,
  body,
  content = '',
  contentless_delete = 1,
  tokenize = 'unicode61'
);
`;

const SEARCH_TERMS = [
  "invoice",
  "subject:roadmap",
  "from_address:grace",
  "kickoff",
  "htmlonly",
  "shadowed",
  "shared",
  "font",
  "nothingmatches",
];

describe("message search index", () => {
  it("replaces a message's search row when its content is indexed again", async () => {
    const { driver, close } = await mailbox(["acc-1"]);
    await driver.write(async (tx) => {
      await indexMessageContent(tx, key("acc-1", "m1"), {
        text: "quarterly invoice",
        html: null,
      });
      await indexMessageContent(tx, key("acc-1", "m1"), {
        text: "updated receipt",
        html: null,
      });
    });

    expect(await matches(driver, "invoice")).toEqual([]);
    expect(await matches(driver, "receipt")).toEqual(["acc-1/m1"]);
    expect(await unkeyedRows(driver)).toBe(0);
    await close();
  });

  it("removes one account's search rows and keeps another's", async () => {
    const { driver, close } = await mailbox(["acc-1", "acc-2"]);
    await driver.write(async (tx) => {
      await indexMessageContent(tx, key("acc-1", "m1"), {
        text: "shared term",
        html: null,
      });
      await indexMessageContent(tx, key("acc-2", "m1"), {
        text: "shared term",
        html: null,
      });
      await deleteAccountSearchIndex(tx, "acc-1");
    });

    expect(await matches(driver, "shared")).toEqual(["acc-2/m1"]);
    expect(await unkeyedRows(driver)).toBe(0);
    await close();
  });

  it("re-indexes bodies stored as raw HTML by their visible text", async () => {
    const { driver, store } = await mailbox(["acc-1", "acc-2"], corpus);
    const expected = await matchesByTerm(driver);
    await driver.write((tx) => rebuildAsRawHtmlIndex(tx));
    expect((await matchesByTerm(driver)).font).toEqual([
      "acc-1/m3",
      "acc-2/m3",
    ]);

    const reopened = await createSqliteMailStore(driver);
    await drainBacklog(reopened);

    expect(await matchesByTerm(driver)).toEqual(expected);
    expect(expected).toMatchObject({
      font: [],
      htmlonly: ["acc-1/m3", "acc-2/m3"],
      shadowed: ["acc-1/m4", "acc-2/m4"],
      invoice: ["acc-1/m1", "acc-2/m1"],
    });
    expect(await unkeyedRows(driver)).toBe(0);
    await store.close();
  });

  it("indexes each message once when the rebuild resumes over partly indexed mail", async () => {
    const { driver, store } = await mailbox(["acc-1", "acc-2"], corpus);
    const expected = await matchesByTerm(driver);
    await driver.write((tx) => rebuildAsRawHtmlIndex(tx));

    await createSqliteMailStore(driver);
    await driver.write(async (tx) => {
      await indexSearchBacklog(tx, nodeBodyCodec, null);
      await deleteAccountSearchIndex(tx, "acc-2");
      await indexMessageContent(tx, key("acc-2", "m2"), {
        text: "Project kickoff notes for acc-2",
        html: null,
      });
    });
    const reopened = await createSqliteMailStore(driver);
    await drainBacklog(reopened);

    expect(await matchesByTerm(driver)).toEqual(expected);
    expect(await keyCount(driver)).toBe(corpus("acc-1").length * 2);
    expect(await unkeyedRows(driver)).toBe(0);
    await store.close();
  });
});

type CorpusMessage = {
  messageId: string;
  subject: string;
  from: string;
  text: string | null;
  html: string | null;
};

function corpus(accountId: string): CorpusMessage[] {
  return [
    {
      messageId: "m1",
      subject: "Quarterly invoice",
      from: "ada@example.com",
      text: "Payment is due on Friday",
      html: null,
    },
    {
      messageId: "m2",
      subject: "Roadmap review",
      from: "grace@example.com",
      text: `Project kickoff notes for ${accountId}`,
      html: `<p>Project <b>kickoff</b> notes for ${accountId}</p>`,
    },
    {
      messageId: "m3",
      subject: "Newsletter",
      from: "news@example.com",
      text: null,
      html: '<table style="font-family:Arial"><tr><td>htmlonly shared content</td></tr></table>',
    },
    {
      messageId: "m4",
      subject: "Empty text part",
      from: "linus@example.com",
      text: "",
      html: "<p>shadowed html body</p>",
    },
  ];
}

async function mailbox(
  accountIds: string[],
  messages: (accountId: string) => CorpusMessage[] = () => [
    {
      messageId: "m1",
      subject: "Subject",
      from: "ada@example.com",
      text: null,
      html: null,
    },
  ],
) {
  const driver = createNodeSqliteDriver();
  const store = await createSqliteMailStore(driver);
  for (const accountId of accountIds) {
    await store.ensureAccount({
      accountId,
      provider: "google",
      generation: "g1",
    });
    const seeded = messages(accountId);
    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session: { accountId, generation: "g1" },
        requestId: "bootstrap",
        from: { streamId: "primary", generation: "g1", checkpoint: null },
        to: { streamId: "primary", generation: "g1", checkpoint: "1" },
        changes: seeded.map((message) => messagePatch(accountId, message)),
        requiredHydration: [],
        roundComplete: true,
      },
      bodies: seeded
        .filter((message) => message.text !== null || message.html !== null)
        .map((message) => ({
          key: key(accountId, message.messageId),
          version: "1",
          text: message.text,
          html: message.html,
        })),
    });
  }
  return { driver, store, close: () => store.close() };
}

// Recreates the index as 0006 left it: contentless, with HTML-only bodies
// indexed as raw markup.
async function rebuildAsRawHtmlIndex(tx: SqlTransaction) {
  await tx.exec(
    "DROP TABLE message_fts; DELETE FROM message_fts_keys; DELETE FROM schema_migrations WHERE id = 7;",
  );
  await tx.exec(RAW_HTML_FTS_SQL);
  const rows = await tx.query(
    `SELECT c.account_id, c.message_id, c.text, c.html, m.subject, m.preview, m.from_address
     FROM message_content c
     JOIN messages m ON m.account_id = c.account_id AND m.message_id = c.message_id
     ORDER BY c.account_id, c.message_id`,
  );
  for (const [index, row] of rows.entries()) {
    const body =
      (await decodeMessageBody(nodeBodyCodec, row.text)) ??
      (await decodeMessageBody(nodeBodyCodec, row.html)) ??
      "";
    await tx.execute(
      "INSERT INTO message_fts(rowid, subject, preview, from_address, body) VALUES (?, ?, ?, ?, ?)",
      [index + 1, row.subject, row.preview, row.from_address, body],
    );
    await tx.execute(
      "INSERT INTO message_fts_keys(account_id, message_id, fts_rowid) VALUES (?, ?, ?)",
      [row.account_id, row.message_id, index + 1],
    );
  }
}

async function drainBacklog(store: MailStore) {
  while ((await store.indexSearchBacklog()).remaining) {
    // keep indexing
  }
}

async function matchesByTerm(driver: SqliteDriver) {
  const result: Record<string, string[]> = {};
  for (const term of SEARCH_TERMS) result[term] = await matches(driver, term);
  return result;
}

async function matches(driver: SqliteDriver, term: string) {
  const rows = await driver.read((tx) =>
    tx.query(
      `SELECT k.account_id, k.message_id FROM message_fts
       JOIN message_fts_keys k ON k.fts_rowid = message_fts.rowid
       WHERE message_fts MATCH ?
       ORDER BY k.account_id, k.message_id`,
      [term],
    ),
  );
  return rows.map((row) => `${row.account_id}/${row.message_id}`);
}

async function unkeyedRows(driver: SqliteDriver) {
  const [row] = await driver.read((tx) =>
    tx.query(
      "SELECT (SELECT COUNT(*) FROM message_fts) - (SELECT COUNT(*) FROM message_fts_keys) AS n",
    ),
  );
  return Number(row?.n);
}

async function keyCount(driver: SqliteDriver) {
  const [row] = await driver.read((tx) =>
    tx.query("SELECT COUNT(*) AS n FROM message_fts_keys"),
  );
  return Number(row?.n);
}

function key(accountId: string, messageId: string) {
  return { accountId, messageId };
}

function messagePatch(
  accountId: string,
  message: CorpusMessage,
): Extract<ProviderChange, { kind: "message_patch" }> {
  return {
    kind: "message_patch",
    key: { accountId, messageId: message.messageId },
    reference: {
      provider: "google",
      messageId: message.messageId,
      conversationId: `c-${message.messageId}`,
      version: "1",
    },
    fields: {
      subject: message.subject,
      preview: "Preview",
      from: message.from,
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
