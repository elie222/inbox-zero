import type { SqlTransaction, SqliteDriver } from "./driver";
import {
  encodeMessageBody,
  storedTextPart,
  type MessageBodyCodec,
} from "./message-body-codec";

const BATCH_ROWS = 500;
const MIGRATION_ID = 8;

// Bodies used to be stored as TEXT, and messages with HTML also kept their
// text part. Runs when the store opens, in the engine's worker or utility
// process. Each batch commits on its own and legacy rows are recognised by
// their TEXT type, so an interrupted run picks up where it stopped on the next
// open; the migration row is written only once none remain.
export async function migrateCompressedMessageBodies(
  driver: SqliteDriver,
  codec: MessageBodyCodec,
) {
  const applied = await driver.read((tx) =>
    tx.query("SELECT 1 FROM schema_migrations WHERE id = ?", [MIGRATION_ID]),
  );
  if (applied.length) return;
  let after: [string, string] = ["", ""];
  for (;;) {
    const last = await driver.write((tx) =>
      compressLegacyBodies(tx, codec, after),
    );
    if (!last) break;
    after = last;
  }
  await driver.write((tx) =>
    tx.execute(
      "INSERT OR IGNORE INTO schema_migrations(id, name) VALUES (?, '0008-compressed-message-bodies')",
      [MIGRATION_ID],
    ),
  );
}

// Converts the next batch of legacy rows after the `after` key, resolving the
// batch's last key, or null when none remain.
export async function compressLegacyBodies(
  tx: SqlTransaction,
  codec: MessageBodyCodec,
  after: [string, string] = ["", ""],
): Promise<[string, string] | null> {
  const rows = await tx.query(
    `SELECT account_id, message_id, html, text FROM message_content
     WHERE (account_id, message_id) > (?, ?)
       AND (typeof(html) = 'text' OR typeof(text) = 'text')
     ORDER BY account_id, message_id
     LIMIT ?`,
    [...after, BATCH_ROWS],
  );
  const tail = rows.at(-1);
  if (!tail) return null;
  for (const row of rows) {
    const html = legacyText(row.html);
    await tx.execute(
      "UPDATE message_content SET html = ?, text = ? WHERE account_id = ? AND message_id = ?",
      [
        await encodeMessageBody(codec, html),
        await encodeMessageBody(
          codec,
          storedTextPart(html, legacyText(row.text)),
        ),
        row.account_id,
        row.message_id,
      ],
    );
  }
  return [String(tail.account_id), String(tail.message_id)];
}

function legacyText(value: unknown) {
  return typeof value === "string" ? value : null;
}
