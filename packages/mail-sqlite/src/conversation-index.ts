import type { SqlTransaction } from "./driver";

export async function migrateConversationIndex(tx: SqlTransaction) {
  const applied = await tx.query(
    "SELECT 1 FROM schema_migrations WHERE id = 2",
  );
  if (applied.length) return;

  await tx.exec(`
    CREATE TABLE effective_role_conversations (
      account_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      role TEXT NOT NULL,
      latest_at_ms INTEGER NOT NULL,
      unread INTEGER NOT NULL,
      starred INTEGER NOT NULL,
      PRIMARY KEY (account_id, conversation_id, role),
      FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
    );
    CREATE INDEX role_conversation_order
      ON effective_role_conversations(account_id, role, latest_at_ms DESC, conversation_id);
    CREATE INDEX role_conversation_counts
      ON effective_role_conversations(account_id, role, unread);
    ${rebuildConversations("1 = 1")}
  `);

  // SQLite maintains this disposable index in the same transaction as every
  // effective-state write, including removals and account cleanup.
  for (const [event, identities] of [
    ["INSERT", ["NEW"]],
    ["DELETE", ["OLD"]],
    ["UPDATE", ["OLD", "NEW"]],
  ] as const) {
    const predicate = identities
      .map(
        (row) =>
          `(account_id = ${row}.account_id AND conversation_id = ${row}.conversation_id)`,
      )
      .join(" OR ");
    await tx.exec(`
      CREATE TRIGGER effective_conversations_after_${event.toLowerCase()}
      AFTER ${event} ON effective_messages
      BEGIN
        DELETE FROM effective_role_conversations WHERE ${predicate};
        ${rebuildConversations(predicate)}
      END;
    `);
  }
  await tx.execute(
    "INSERT INTO schema_migrations(id, name) VALUES (2, '0002-role-conversation-index')",
  );
}

function rebuildConversations(predicate: string) {
  return `INSERT INTO effective_role_conversations(
      account_id, conversation_id, role, latest_at_ms, unread, starred
    )
    SELECT account_id, conversation_id, roles.value,
           MAX(received_at_ms), MAX(1 - read), MAX(starred)
    FROM effective_messages, json_each(roles_json) AS roles
    WHERE ${predicate}
    GROUP BY account_id, conversation_id, roles.value;`;
}
