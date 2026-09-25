import type { MessageKey } from "@inboxzero/mail-core/identities";
import type { SqlTransaction } from "./driver";

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

// The index used to keep its own copy of every subject, preview, sender, and
// body, which was most of the mailbox file. A contentless index answers MATCH
// by rowid only, and message_fts_keys maps those rowids back to messages.
// Dropping the old copy is fast; its rows are re-added in engine-paced batches
// by indexSearchBacklog so opening the mailbox never waits on a full rebuild.
export async function migrateContentlessSearchIndex(tx: SqlTransaction) {
  const applied = await tx.query(
    "SELECT 1 FROM schema_migrations WHERE id = 6",
  );
  if (applied.length) return;
  const rebuilt = await withSearchIndex(tx, "contentless_fts", async () => {
    await tx.exec("DROP TABLE IF EXISTS message_fts");
    await tx.exec(MESSAGE_FTS_SQL);
    await tx.execute("DELETE FROM message_fts_keys");
  });
  if (!rebuilt) return;
  await tx.execute(
    "INSERT INTO schema_migrations(id, name) VALUES (6, '0006-contentless-message-search')",
  );
}

export async function indexMessageContent(
  tx: SqlTransaction,
  key: MessageKey,
  body: string,
) {
  await withSearchIndex(tx, "index_content", () =>
    writeSearchRow(tx, key, body),
  );
}

// Indexes the next batch of stored bodies that have no search row, such as
// those left by the contentless rebuild, in key order after `after`. Resolves
// the batch's last key, or null once none remain or the index is unavailable.
export async function indexSearchBacklog(
  tx: SqlTransaction,
  after: MessageKey | null,
): Promise<MessageKey | null> {
  let last: MessageKey | null = null;
  const indexed = await withSearchIndex(tx, "index_backlog", async () => {
    const from = [after?.accountId ?? "", after?.messageId ?? ""];
    const batch = await tx.query(
      `SELECT c.account_id, c.message_id
       FROM message_content c
       JOIN messages m ON m.account_id = c.account_id AND m.message_id = c.message_id
       WHERE (c.account_id, c.message_id) > (?, ?)
         AND NOT EXISTS (
           SELECT 1 FROM message_fts_keys k
           WHERE k.account_id = c.account_id AND k.message_id = c.message_id
         )
       ORDER BY c.account_id, c.message_id
       LIMIT ?`,
      [...from, BACKLOG_BATCH_ROWS],
    );
    const tail = batch.at(-1);
    if (!tail) return;
    const to = [String(tail.account_id), String(tail.message_id)];
    // Rowids are assigned above the current maximum up front so the whole
    // batch indexes in one INSERT ... SELECT; row-at-a-time inserts were
    // several times slower through the drivers.
    const [top] = await tx.query(
      "SELECT rowid FROM message_fts ORDER BY rowid DESC LIMIT 1",
    );
    const base = Number(top?.rowid ?? 0);
    await tx.execute(
      `INSERT INTO message_fts_keys(account_id, message_id, fts_rowid)
       SELECT c.account_id, c.message_id,
         ? + ROW_NUMBER() OVER (ORDER BY c.account_id, c.message_id)
       FROM message_content c
       JOIN messages m ON m.account_id = c.account_id AND m.message_id = c.message_id
       WHERE (c.account_id, c.message_id) > (?, ?)
         AND (c.account_id, c.message_id) <= (?, ?)
         AND NOT EXISTS (
           SELECT 1 FROM message_fts_keys k
           WHERE k.account_id = c.account_id AND k.message_id = c.message_id
         )`,
      [base, ...from, ...to],
    );
    await tx.execute(
      `INSERT INTO message_fts(rowid, subject, preview, from_address, body)
       SELECT k.fts_rowid, m.subject, m.preview, m.from_address, COALESCE(c.text, c.html, '')
       FROM message_fts_keys k
       JOIN messages m ON m.account_id = k.account_id AND m.message_id = k.message_id
       JOIN message_content c ON c.account_id = k.account_id AND c.message_id = k.message_id
       WHERE (k.account_id, k.message_id) > (?, ?)
         AND (k.account_id, k.message_id) <= (?, ?)
         AND k.fts_rowid > ?`,
      [...from, ...to, base],
    );
    last = { accountId: to[0], messageId: to[1] };
  });
  return indexed ? last : null;
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
}

async function writeSearchRow(
  tx: SqlTransaction,
  key: MessageKey,
  body: string,
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
  const inserted = await tx.execute(
    `INSERT INTO message_fts(subject, preview, from_address, body)
     SELECT subject, preview, from_address, ?
     FROM messages WHERE account_id = ? AND message_id = ?`,
    [body, key.accountId, key.messageId],
  );
  if (inserted.changedRows === 0) {
    await deleteKey(tx, key);
    return;
  }
  const [row] = await tx.query("SELECT last_insert_rowid() AS id");
  await tx.execute(
    `INSERT INTO message_fts_keys(account_id, message_id, fts_rowid) VALUES (?, ?, ?)
     ON CONFLICT(account_id, message_id) DO UPDATE SET fts_rowid = excluded.fts_rowid`,
    [key.accountId, key.messageId, row?.id],
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
