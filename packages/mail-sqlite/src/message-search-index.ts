import type { MessageKey } from "@inboxzero/mail-core/identities";
import type { SqlTransaction } from "./driver";

// FTS5 cannot index its UNINDEXED account/message columns, so deleting a
// message's row by them scans the whole search index. That ran for every body
// written during sync and grew with the mailbox; this table maps each message
// to its FTS rowid so updates and deletes are direct lookups.
export async function migrateMessageSearchKeys(tx: SqlTransaction) {
  const applied = await tx.query(
    "SELECT 1 FROM schema_migrations WHERE id = 4",
  );
  if (applied.length) return;
  await tx.exec(`
    CREATE TABLE IF NOT EXISTS message_fts_keys (
      account_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      fts_rowid INTEGER NOT NULL,
      PRIMARY KEY (account_id, message_id)
    );
  `);
  await withSearchIndex(tx, "backfill_fts_keys", () =>
    tx.execute(
      `INSERT OR REPLACE INTO message_fts_keys(account_id, message_id, fts_rowid)
       SELECT account_id, message_id, rowid FROM message_fts`,
    ),
  );
  await tx.execute(
    "INSERT INTO schema_migrations(id, name) VALUES (4, '0004-message-search-keys')",
  );
}

export async function indexMessageContent(
  tx: SqlTransaction,
  key: MessageKey,
  body: string,
) {
  await withSearchIndex(tx, "index_content", async () => {
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
      `INSERT INTO message_fts(account_id, message_id, subject, preview, from_address, body)
       SELECT account_id, message_id, subject, preview, from_address, ?
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
  });
}

export async function deleteAccountSearchIndex(
  tx: SqlTransaction,
  accountId: string,
) {
  await withSearchIndex(tx, "purge_fts", () =>
    tx.execute(
      "DELETE FROM message_fts WHERE rowid IN (SELECT fts_rowid FROM message_fts_keys WHERE account_id = ?)",
      [accountId],
    ),
  );
  await tx.execute("DELETE FROM message_fts_keys WHERE account_id = ?", [
    accountId,
  ]);
}

export async function clearSearchIndex(tx: SqlTransaction) {
  await withSearchIndex(tx, "clear_fts", () =>
    tx.execute("DELETE FROM message_fts"),
  );
  await tx.execute("DELETE FROM message_fts_keys");
}

function deleteKey(tx: SqlTransaction, key: MessageKey) {
  return tx.execute(
    "DELETE FROM message_fts_keys WHERE account_id = ? AND message_id = ?",
    [key.accountId, key.messageId],
  );
}

// FTS is optional when the runtime SQLite build omits it; a failure must not
// abort the surrounding write.
async function withSearchIndex(
  tx: SqlTransaction,
  savepoint: string,
  run: () => Promise<unknown>,
) {
  try {
    await tx.exec(`SAVEPOINT ${savepoint}`);
    await run();
    await tx.exec(`RELEASE ${savepoint}`);
  } catch {
    try {
      await tx.exec(`ROLLBACK TO ${savepoint}`);
      await tx.exec(`RELEASE ${savepoint}`);
    } catch {
      // savepoint missing
    }
  }
}
