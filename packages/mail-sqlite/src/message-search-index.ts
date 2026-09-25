import type { MessageKey } from "@inboxzero/mail-core/identities";
import type { SqlTransaction, SqlValue } from "./driver";
import { decodeMessageBody, type MessageBodyCodec } from "./message-body-codec";
import { searchableBody, searchableText } from "./search-text";

const BACKLOG_BATCH_ROWS = 100;

// contentless_delete (SQLite 3.43+) lets rows be replaced and removed by rowid
// without the index keeping the text it tokenized.
const MESSAGE_FTS_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(
  subject,
  preview,
  from_address,
  body,
  content = '',
  contentless_delete = 1,
  tokenize = 'unicode61'
);
`;

// Rebuilds the index empty whenever what it stores changes: 0006 dropped the
// index's own copy of every message's text, 0007 replaced raw HTML bodies
// with their visible text and split unspaced scripts into characters.
// Dropping is fast; indexSearchBacklog re-adds rows in engine-paced batches
// so opening the mailbox never waits on a full rebuild.
export async function migrateMessageSearchIndex(tx: SqlTransaction) {
  const applied = await tx.query(
    "SELECT 1 FROM schema_migrations WHERE id = 7",
  );
  if (applied.length) return;
  const rebuilt = await withSearchIndex(tx, "rebuild_fts", async () => {
    await tx.exec("DROP TABLE IF EXISTS message_fts");
    await tx.exec(MESSAGE_FTS_SQL);
    await tx.execute("DELETE FROM message_fts_keys");
    await markSearchIndexIncomplete(tx);
  });
  if (!rebuilt) return;
  await tx.execute(
    "INSERT INTO schema_migrations(id, name) VALUES (7, '0007-clean-text-message-search')",
  );
}

export async function indexMessageContent(
  tx: SqlTransaction,
  key: MessageKey,
  content: MessageBody,
) {
  const indexed = await withSearchIndex(tx, "index_content", () =>
    writeSearchRow(tx, key, content),
  );
  if (!indexed) await abandonSearchRow(tx, key);
}

// Indexes the next batch of stored bodies that have no search row, such as
// those left by a rebuild, in key order after `after`. Resolves the batch's
// last key, or null once none remain.
export async function indexSearchBacklog(
  tx: SqlTransaction,
  codec: MessageBodyCodec,
  after: MessageKey | null,
): Promise<BacklogBatch> {
  let last: MessageKey | null = null;
  const indexed = await withSearchIndex(tx, "index_backlog", async () => {
    const batch = await tx.query(
      `SELECT c.account_id, c.message_id, c.text, c.html,
              m.subject, m.preview, m.from_address
       FROM message_content c
       JOIN messages m ON m.account_id = c.account_id AND m.message_id = c.message_id
       WHERE (c.account_id, c.message_id) > (?, ?)
         AND NOT EXISTS (
           SELECT 1 FROM message_fts_keys k
           WHERE k.account_id = c.account_id AND k.message_id = c.message_id
         )
       ORDER BY c.account_id, c.message_id
       LIMIT ?`,
      [after?.accountId ?? "", after?.messageId ?? "", BACKLOG_BATCH_ROWS],
    );
    const bodies = await Promise.all(
      batch.map(async (row) => ({
        text: await decodeMessageBody(codec, row.text),
        html: await decodeMessageBody(codec, row.html),
      })),
    );
    last = await insertSearchRows(tx, batch, bodies);
  });
  return indexed ? { indexed: true, last } : { indexed: false };
}

// Re-indexes a message whose subject, preview, or sender is new or changed.
// Without a stored body its metadata is indexed directly. With one, its row is
// dropped for the body backlog to rebuild with the text, and search leans on
// the substring fallback until then.
export async function indexMessageMetadata(
  tx: SqlTransaction,
  key: MessageKey,
) {
  const [stored] = await tx.query(
    "SELECT 1 FROM message_content WHERE account_id = ? AND message_id = ?",
    [key.accountId, key.messageId],
  );
  const indexed = await withSearchIndex(tx, "index_metadata", () =>
    stored
      ? dropSearchRow(tx, key)
      : writeSearchRow(tx, key, { text: null, html: null }),
  );
  if (!indexed) await abandonSearchRow(tx, key);
  else if (stored) await markSearchIndexIncomplete(tx);
}

// Indexes the metadata of the next batch of messages that still have no
// search row once the body backlog is done, such as mail synced without its
// body before metadata was indexed. Messages with a stored body are left to the
// body backlog. Resolves like indexSearchBacklog.
export async function indexMetadataBacklog(
  tx: SqlTransaction,
  after: MessageKey | null,
): Promise<BacklogBatch> {
  let last: MessageKey | null = null;
  const indexed = await withSearchIndex(
    tx,
    "index_metadata_backlog",
    async () => {
      const batch = await tx.query(
        `SELECT m.account_id, m.message_id, m.subject, m.preview, m.from_address
         FROM messages m
         WHERE (m.account_id, m.message_id) > (?, ?)
           AND NOT EXISTS (
             SELECT 1 FROM message_fts_keys k
             WHERE k.account_id = m.account_id AND k.message_id = m.message_id
           )
           AND NOT EXISTS (
             SELECT 1 FROM message_content c
             WHERE c.account_id = m.account_id AND c.message_id = m.message_id
           )
         ORDER BY m.account_id, m.message_id
         LIMIT ?`,
        [after?.accountId ?? "", after?.messageId ?? "", BACKLOG_BATCH_ROWS],
      );
      last = await insertSearchRows(
        tx,
        batch,
        batch.map(() => ({ text: null, html: null })),
      );
    },
  );
  return indexed ? { indexed: true, last } : { indexed: false };
}

// Marks the index complete once every message has a search row, which lets
// search start from index matches. Resolves whether it is complete.
export async function completeSearchIndexIfFull(tx: SqlTransaction) {
  const [missing] = await tx.query(
    `SELECT 1 FROM messages m
     WHERE NOT EXISTS (
       SELECT 1 FROM message_fts_keys k
       WHERE k.account_id = m.account_id AND k.message_id = m.message_id
     )
     LIMIT 1`,
  );
  if (missing) return false;
  await tx.execute(
    "INSERT OR REPLACE INTO search_index_state(id, complete) VALUES (1, 1)",
  );
  return true;
}

export async function readSearchIndexComplete(tx: SqlTransaction) {
  const [state] = await tx.query(
    "SELECT complete FROM search_index_state WHERE id = 1",
  );
  return Number(state?.complete) === 1;
}

export async function deleteAccountSearchIndex(
  tx: SqlTransaction,
  accountId: string,
) {
  const purged = await withSearchIndex(tx, "purge_fts", () =>
    tx.execute(
      "DELETE FROM message_fts WHERE rowid IN (SELECT fts_rowid FROM message_fts_keys WHERE account_id = ?)",
      [accountId],
    ),
  );
  // The keys are the only way back to rows a failed delete left behind.
  if (!purged) return;
  await tx.execute("DELETE FROM message_fts_keys WHERE account_id = ?", [
    accountId,
  ]);
}

export async function clearSearchIndex(tx: SqlTransaction) {
  const cleared = await withSearchIndex(tx, "clear_fts", () =>
    tx.execute("INSERT INTO message_fts(message_fts) VALUES ('delete-all')"),
  );
  if (!cleared) return;
  await tx.execute("DELETE FROM message_fts_keys");
  await markSearchIndexIncomplete(tx);
}

type MessageBody = { text: string | null; html: string | null };

type BacklogBatch =
  | { indexed: false }
  | { indexed: true; last: MessageKey | null };

async function writeSearchRow(
  tx: SqlTransaction,
  key: MessageKey,
  content: MessageBody,
) {
  const [existing] = await tx.query(
    "SELECT fts_rowid FROM message_fts_keys WHERE account_id = ? AND message_id = ?",
    [key.accountId, key.messageId],
  );
  if (existing) {
    await tx.execute("DELETE FROM message_fts WHERE rowid = ?", [
      existing.fts_rowid,
    ]);
  }
  const [message] = await tx.query(
    "SELECT subject, preview, from_address FROM messages WHERE account_id = ? AND message_id = ?",
    [key.accountId, key.messageId],
  );
  if (!message) {
    await deleteKey(tx, key);
    return;
  }
  await tx.execute(
    "INSERT INTO message_fts(subject, preview, from_address, body) VALUES (?, ?, ?, ?)",
    searchColumns(message, content),
  );
  const [row] = await tx.query("SELECT last_insert_rowid() AS id");
  await tx.execute(
    `INSERT INTO message_fts_keys(account_id, message_id, fts_rowid) VALUES (?, ?, ?)
     ON CONFLICT(account_id, message_id) DO UPDATE SET fts_rowid = excluded.fts_rowid`,
    [key.accountId, key.messageId, row?.id],
  );
}

// Rowids are assigned above the current maximum up front so a whole batch
// indexes in one multi-row INSERT; row-at-a-time inserts were several times
// slower through the drivers. Resolves the batch's last key.
async function insertSearchRows(
  tx: SqlTransaction,
  batch: Array<Record<string, SqlValue>>,
  bodies: MessageBody[],
): Promise<MessageKey | null> {
  const tail = batch.at(-1);
  if (!tail) return null;
  const [top] = await tx.query(
    "SELECT rowid FROM message_fts ORDER BY rowid DESC LIMIT 1",
  );
  const base = Number(top?.rowid ?? 0);
  await tx.execute(
    `INSERT INTO message_fts(rowid, subject, preview, from_address, body)
     VALUES ${batch.map(() => "(?, ?, ?, ?, ?)").join(", ")}`,
    batch.flatMap((row, index) => [
      base + index + 1,
      ...searchColumns(row, bodies[index]),
    ]),
  );
  await tx.execute(
    `INSERT INTO message_fts_keys(account_id, message_id, fts_rowid)
     VALUES ${batch.map(() => "(?, ?, ?)").join(", ")}`,
    batch.flatMap((row, index) => [
      row.account_id,
      row.message_id,
      base + index + 1,
    ]),
  );
  return {
    accountId: String(tail.account_id),
    messageId: String(tail.message_id),
  };
}

function searchColumns(
  message: Record<string, SqlValue>,
  content: MessageBody,
): string[] {
  return [
    searchableText(String(message.subject ?? "")),
    searchableText(String(message.preview ?? "")),
    searchableText(String(message.from_address ?? "")),
    searchableBody(content),
  ];
}

async function dropSearchRow(tx: SqlTransaction, key: MessageKey) {
  await tx.execute(
    "DELETE FROM message_fts WHERE rowid IN (SELECT fts_rowid FROM message_fts_keys WHERE account_id = ? AND message_id = ?)",
    [key.accountId, key.messageId],
  );
  await deleteKey(tx, key);
}

// A failed write leaves the message's previous row in place, so its key is
// dropped: the backlog then rebuilds the row and the substring fallback covers
// it meanwhile. An orphaned FTS row without a key never matches a message.
async function abandonSearchRow(tx: SqlTransaction, key: MessageKey) {
  await deleteKey(tx, key);
  await markSearchIndexIncomplete(tx);
}

function markSearchIndexIncomplete(tx: SqlTransaction) {
  return tx.execute(
    "INSERT OR REPLACE INTO search_index_state(id, complete) VALUES (1, 0)",
  );
}

function deleteKey(tx: SqlTransaction, key: MessageKey) {
  return tx.execute(
    "DELETE FROM message_fts_keys WHERE account_id = ? AND message_id = ?",
    [key.accountId, key.messageId],
  );
}

// FTS is optional when the runtime SQLite build omits it; a failure must not
// abort the surrounding write. Resolves whether the index work succeeded.
async function withSearchIndex(
  tx: SqlTransaction,
  savepoint: string,
  run: () => Promise<unknown>,
): Promise<boolean> {
  try {
    await tx.exec(`SAVEPOINT ${savepoint}`);
    await run();
    await tx.exec(`RELEASE ${savepoint}`);
    return true;
  } catch {
    try {
      await tx.exec(`ROLLBACK TO ${savepoint}`);
      await tx.exec(`RELEASE ${savepoint}`);
    } catch {
      // savepoint missing
    }
    return false;
  }
}
