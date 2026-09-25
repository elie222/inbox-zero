import type { MessageKey } from "@inboxzero/mail-core/identities";
import type { SqlTransaction, SqlValue } from "./driver";
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
  await withSearchIndex(tx, "index_content", () =>
    writeSearchRow(tx, key, content),
  );
}

// Indexes the next batch of stored bodies that have no search row, such as
// those left by a rebuild, in key order after `after`. Resolves the batch's
// last key, or null once none remain or the index is unavailable.
export async function indexSearchBacklog(
  tx: SqlTransaction,
  after: MessageKey | null,
): Promise<MessageKey | null> {
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
    const tail = batch.at(-1);
    if (!tail) return;
    // Rowids are assigned above the current maximum up front so the whole
    // batch indexes in one multi-row INSERT; row-at-a-time inserts were
    // several times slower through the drivers.
    const [top] = await tx.query(
      "SELECT rowid FROM message_fts ORDER BY rowid DESC LIMIT 1",
    );
    const base = Number(top?.rowid ?? 0);
    await tx.execute(
      `INSERT INTO message_fts(rowid, subject, preview, from_address, body)
       VALUES ${batch.map(() => "(?, ?, ?, ?, ?)").join(", ")}`,
      batch.flatMap((row, index) => [
        base + index + 1,
        ...searchColumns(row, {
          text: nullableString(row.text),
          html: nullableString(row.html),
        }),
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
    last = {
      accountId: String(tail.account_id),
      messageId: String(tail.message_id),
    };
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

type MessageBody = { text: string | null; html: string | null };

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

function nullableString(value: SqlValue) {
  return value == null ? null : String(value);
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
