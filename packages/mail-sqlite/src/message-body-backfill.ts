import type { MessageKey } from "@inboxzero/mail-core/identities";
import type { SqlTransaction } from "./driver";
import {
  decodeMessageBody,
  encodeMessageBody,
  storedTextPart,
  type MessageBodyCodec,
} from "./message-body-codec";

const BACKFILL_BATCH_ROWS = 100;
const MIGRATION_ID = 8;

export async function hasUncompressedBodies(tx: SqlTransaction) {
  const applied = await tx.query(
    "SELECT 1 FROM schema_migrations WHERE id = ?",
    [MIGRATION_ID],
  );
  return applied.length === 0;
}

// Bodies written before compression are TEXT, and messages with HTML also kept
// their text part. Multi-GB mailboxes can't be rewritten while the mailbox
// opens, so the engine rewrites them in short idle batches in key order after
// `after`, and readers accept both formats meanwhile. Resolves the batch's last
// key, or null once none remain, when the migration is recorded so later opens
// skip the scan.
export async function compressBodyBacklog(
  tx: SqlTransaction,
  codec: MessageBodyCodec,
  after: MessageKey | null,
): Promise<MessageKey | null> {
  const rows = await tx.query(
    `SELECT account_id, message_id, html, text FROM message_content
     WHERE (account_id, message_id) > (?, ?)
       AND (typeof(html) = 'text' OR typeof(text) = 'text')
     ORDER BY account_id, message_id
     LIMIT ?`,
    [after?.accountId ?? "", after?.messageId ?? "", BACKFILL_BATCH_ROWS],
  );
  const tail = rows.at(-1);
  if (!tail) {
    await tx.execute(
      "INSERT OR IGNORE INTO schema_migrations(id, name) VALUES (?, '0008-compressed-message-bodies')",
      [MIGRATION_ID],
    );
    return null;
  }
  for (const row of rows) {
    const html = await decodeMessageBody(codec, row.html);
    const text = await decodeMessageBody(codec, row.text);
    await tx.execute(
      "UPDATE message_content SET html = ?, text = ? WHERE account_id = ? AND message_id = ?",
      [
        await encodeMessageBody(codec, html),
        await encodeMessageBody(codec, storedTextPart(html, text)),
        row.account_id,
        row.message_id,
      ],
    );
  }
  return {
    accountId: String(tail.account_id),
    messageId: String(tail.message_id),
  };
}
