import type {
  ContactSuggestion,
  ContactSuggestionQuery,
} from "@inboxzero/mail-core/queries";
import type { MessageKey } from "@inboxzero/mail-core/identities";
import type { SqlTransaction } from "./driver";

export async function migrateContactSuggestions(tx: SqlTransaction) {
  await tx.exec(`
    CREATE TABLE IF NOT EXISTS contact_interactions (
      account_id TEXT NOT NULL, message_id TEXT NOT NULL, email TEXT NOT NULL,
      name TEXT NOT NULL, sender TEXT NOT NULL, sent INTEGER NOT NULL, last_at INTEGER NOT NULL,
      PRIMARY KEY(account_id, message_id, email)
    );
    CREATE INDEX IF NOT EXISTS contact_interaction_group
      ON contact_interactions(account_id, email, name, sender, sent, last_at DESC);
    CREATE TABLE IF NOT EXISTS contact_stats (
      account_id TEXT NOT NULL, email TEXT NOT NULL, name TEXT NOT NULL,
      sender TEXT NOT NULL, sent INTEGER NOT NULL, count INTEGER NOT NULL, last_at INTEGER NOT NULL,
      PRIMARY KEY(account_id, email, name, sender, sent)
    );
    CREATE INDEX IF NOT EXISTS contact_sent_senders ON contact_stats(account_id, sender) WHERE sent = 1;
    CREATE TABLE IF NOT EXISTS contact_tokens (
      account_id TEXT NOT NULL, token TEXT NOT NULL, email TEXT NOT NULL,
      PRIMARY KEY(account_id, token, email)
    );
    CREATE INDEX IF NOT EXISTS contact_tokens_email ON contact_tokens(account_id, email);
    CREATE TABLE IF NOT EXISTS contact_indexed_messages (
      account_id TEXT NOT NULL, message_id TEXT NOT NULL,
      PRIMARY KEY(account_id, message_id)
    );
    CREATE TABLE IF NOT EXISTS contact_backfill_state (
      id INTEGER PRIMARY KEY CHECK(id = 1), after_rowid INTEGER NOT NULL, complete INTEGER NOT NULL
    );
    INSERT OR IGNORE INTO contact_backfill_state VALUES (1, 0, 0);
    INSERT OR IGNORE INTO schema_migrations VALUES (10, '0010-contact-suggestions');
  `);
}

export async function indexContactMessage(tx: SqlTransaction, key: MessageKey) {
  const previous = await tx.query(
    "SELECT * FROM contact_interactions WHERE account_id = ? AND message_id = ?",
    [key.accountId, key.messageId],
  );
  const [message] = await tx.query(
    "SELECT * FROM messages WHERE account_id = ? AND message_id = ?",
    [key.accountId, key.messageId],
  );
  const contacts = new Map<
    string,
    { email: string; name: string; sent: number }
  >();
  const sender = parseAddress(String(message?.from_address ?? ""));
  if (message && !message.deleted && !message.in_draft && !message.in_spam) {
    if (sender && !isAutomatedAddress(sender.email))
      contacts.set(sender.email, { ...sender, sent: 0 });
    for (const address of [
      ...JSON.parse(String(message.to_json)),
      ...JSON.parse(String(message.cc_json)),
    ] as string[]) {
      const contact = parseAddress(address);
      if (!contact || isAutomatedAddress(contact.email)) continue;
      const existing = contacts.get(contact.email);
      contacts.set(contact.email, {
        ...contact,
        name: existing?.name || contact.name,
        sent: contact.email !== sender?.email ? Number(message.in_sent) : 0,
      });
    }
  }
  const next = [...contacts.values()].map((contact) => ({
    ...contact,
    sender: sender?.email ?? "",
    last_at: Number(message?.received_at_ms ?? 0),
  }));
  // Most sync patches only change read state or labels. Avoid touching this
  // index unless the message's actual contact evidence changed.
  const unchanged =
    previous.length === next.length &&
    next.every((contact) =>
      previous.some(
        (row) =>
          row.email === contact.email &&
          row.name === contact.name &&
          row.sender === contact.sender &&
          row.sent === contact.sent &&
          row.last_at === contact.last_at,
      ),
    );
  if (!unchanged) {
    await tx.execute(
      "DELETE FROM contact_interactions WHERE account_id = ? AND message_id = ?",
      [key.accountId, key.messageId],
    );
    for (const row of previous) {
      const group = [
        key.accountId,
        String(row.email),
        String(row.name),
        String(row.sender),
        Number(row.sent),
      ];
      await tx.execute(
        `UPDATE contact_stats SET count = count - 1,
        last_at = COALESCE((SELECT MAX(last_at) FROM contact_interactions WHERE account_id = ? AND email = ? AND name = ? AND sender = ? AND sent = ?), 0)
        WHERE account_id = ? AND email = ? AND name = ? AND sender = ? AND sent = ?`,
        [...group, ...group],
      );
      await tx.execute(
        "DELETE FROM contact_stats WHERE account_id = ? AND email = ? AND name = ? AND sender = ? AND sent = ? AND count = 0",
        group,
      );
    }
    for (const row of next) {
      await tx.execute(
        "INSERT INTO contact_interactions VALUES (?, ?, ?, ?, ?, ?, ?)",
        [
          key.accountId,
          key.messageId,
          row.email,
          row.name,
          row.sender,
          row.sent,
          row.last_at,
        ],
      );
      await tx.execute(
        `INSERT INTO contact_stats VALUES (?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(account_id, email, name, sender, sent) DO UPDATE SET count = count + 1, last_at = MAX(last_at, excluded.last_at)`,
        [key.accountId, row.email, row.name, row.sender, row.sent, row.last_at],
      );
    }
    const previousEmails = new Set(previous.map((row) => String(row.email)));
    for (const email of previousEmails) {
      await tx.execute(
        "DELETE FROM contact_tokens WHERE account_id = ? AND email = ?",
        [key.accountId, email],
      );
      const names = await tx.query(
        "SELECT DISTINCT name FROM contact_stats WHERE account_id = ? AND email = ?",
        [key.accountId, email],
      );
      for (const row of names)
        await insertContactTokens(tx, key.accountId, email, String(row.name));
    }
    for (const row of next) {
      if (!previousEmails.has(row.email))
        await insertContactTokens(tx, key.accountId, row.email, row.name);
    }
  }
  await tx.execute(
    "INSERT OR IGNORE INTO contact_indexed_messages VALUES (?, ?)",
    [key.accountId, key.messageId],
  );
}

export async function indexContactBacklog(tx: SqlTransaction) {
  const [state] = await tx.query(
    "SELECT * FROM contact_backfill_state WHERE id = 1",
  );
  if (state.complete) return { remaining: false };
  const rows = await tx.query(
    `SELECT m.rowid, m.account_id, m.message_id FROM messages m
    LEFT JOIN contact_indexed_messages i ON i.account_id = m.account_id AND i.message_id = m.message_id
    WHERE m.rowid > ? AND i.message_id IS NULL ORDER BY m.rowid LIMIT 100`,
    [Number(state.after_rowid)],
  );
  for (const row of rows)
    await indexContactMessage(tx, {
      accountId: String(row.account_id),
      messageId: String(row.message_id),
    });
  if (rows.length)
    await tx.execute(
      "UPDATE contact_backfill_state SET after_rowid = ? WHERE id = 1",
      [Number(rows.at(-1)?.rowid)],
    );
  else
    await tx.execute(
      "UPDATE contact_backfill_state SET complete = 1 WHERE id = 1",
    );
  return { remaining: rows.length > 0 };
}

export async function readContactSuggestions(
  tx: SqlTransaction,
  input: ContactSuggestionQuery,
  nowMs: number,
): Promise<ContactSuggestion[]> {
  const query = input.query.trim().toLowerCase();
  if (!query) return [];
  const excluded = [...input.ownAddresses, ...input.excludeEmails].map(
    (email) => email.trim().toLowerCase(),
  );
  const own = input.ownAddresses.map((email) => email.trim().toLowerCase());
  // Sending is deliberate contact evidence: each sent-to interaction weighs
  // 20 vs 1 for received mail. A bounded 0..5 recency bonus (30-day half-life)
  // breaks frequency ties without overwhelming repeated correspondence.
  const rows = await tx.query(
    `
    WITH own AS (
      SELECT value AS email FROM json_each(?)
      UNION SELECT sender FROM contact_stats WHERE account_id = ? AND sent = 1 AND sender != ''
    ), candidates AS (
      SELECT DISTINCT email FROM contact_tokens
      WHERE account_id = ? AND token >= ? AND token < ?
        AND email NOT IN (SELECT value FROM json_each(?))
        AND email NOT IN (SELECT email FROM own)
    ), evidence AS (
      SELECT s.*,
        CASE WHEN s.email != s.sender AND (s.sent = 1 OR s.sender IN (SELECT email FROM own)) THEN s.count ELSE 0 END AS sent_count
      FROM candidates c JOIN contact_stats s ON s.account_id = ? AND s.email = c.email
    ), totals AS (
      SELECT email, SUM(20 * sent_count + count - sent_count) + 5.0 * 30 / (30 + MAX(0, (? - MAX(last_at)) / 86400000.0)) AS score,
        MAX(last_at) AS last_at FROM evidence GROUP BY email
    ), ranked AS MATERIALIZED (
      SELECT * FROM totals ORDER BY score DESC, last_at DESC, email LIMIT 8
    )
    SELECT t.email, (
      SELECT name FROM contact_stats WHERE account_id = ? AND email = t.email AND name != ''
      GROUP BY name ORDER BY SUM(count) DESC, MAX(last_at) DESC, name LIMIT 1
    ) AS name FROM ranked t ORDER BY t.score DESC, t.last_at DESC, t.email
  `,
    [
      JSON.stringify(own),
      input.accountId,
      input.accountId,
      query,
      `${query}\u{10ffff}`,
      JSON.stringify(excluded),
      input.accountId,
      nowMs,
      input.accountId,
    ],
  );
  return rows.map((row) => ({
    emailAddress: String(row.email),
    ...(row.name ? { name: String(row.name) } : {}),
  }));
}

function parseAddress(address: string) {
  const match = address.trim().match(/^(.*?)<([^<>]+)>\s*$/u);
  const email = (match?.[2] ?? address).trim().toLowerCase();
  if (!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/u.test(email)) return null;
  return {
    email,
    name: (match?.[1] ?? "").trim().replace(/^"|"$/g, "").trim(),
  };
}

function isAutomatedAddress(email: string) {
  const local = email.split("@")[0];
  return (
    /^(?:notifications|mailer-daemon|postmaster|bounce)(?:[+._-]|$)/i.test(
      local,
    ) || /(?:no[._-]?reply|do[._-]?not[._-]?reply)/i.test(local)
  );
}

async function insertContactTokens(
  tx: SqlTransaction,
  accountId: string,
  email: string,
  displayName: string,
) {
  // B-tree ranges on normalized tokens support Unicode word prefixes without
  // optional FTS extensions or scanning message rows.
  const name = displayName.toLowerCase();
  const tokens = new Set([
    email,
    name,
    ...email.split(/[^\p{L}\p{N}]+/u),
    ...name.split(/[^\p{L}\p{N}]+/u),
  ]);
  for (const token of tokens)
    if (token)
      await tx.execute(
        "INSERT OR IGNORE INTO contact_tokens VALUES (?, ?, ?)",
        [accountId, token, email],
      );
}

export async function deleteAccountContactSuggestions(
  tx: SqlTransaction,
  accountId: string,
) {
  for (const table of [
    "contact_interactions",
    "contact_stats",
    "contact_tokens",
    "contact_indexed_messages",
  ]) {
    await tx.execute(`DELETE FROM ${table} WHERE account_id = ?`, [accountId]);
  }
}
