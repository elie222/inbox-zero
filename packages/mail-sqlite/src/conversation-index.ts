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

const DELETE_OLD_MEMBERSHIPS = `DELETE FROM effective_message_memberships
  WHERE account_id = OLD.account_id AND message_id = OLD.message_id;`;

export async function migrateMembershipIndex(tx: SqlTransaction) {
  const applied = await tx.query(
    "SELECT 1 FROM schema_migrations WHERE id = 3",
  );
  if (applied.length) return;

  // Label, category, and folder views otherwise scan every message and parse
  // its label JSON, which made sidebar counts cost seconds per refresh. Rows
  // are per message so each write only touches that message's rows.
  await tx.exec(`
    CREATE TABLE effective_message_memberships (
      account_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      membership_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      received_at_ms INTEGER NOT NULL,
      read INTEGER NOT NULL,
      starred INTEGER NOT NULL,
      PRIMARY KEY (account_id, kind, membership_id, message_id),
      FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
    );
    CREATE INDEX message_memberships_by_message
      ON effective_message_memberships(account_id, message_id);
    ${insertMemberships("m")}
    CREATE TRIGGER effective_memberships_after_insert
    AFTER INSERT ON effective_messages
    BEGIN
      ${insertMemberships("NEW")}
    END;
    CREATE TRIGGER effective_memberships_after_delete
    AFTER DELETE ON effective_messages
    BEGIN
      ${DELETE_OLD_MEMBERSHIPS}
    END;
    CREATE TRIGGER effective_memberships_after_update
    AFTER UPDATE OF account_id, message_id, conversation_id, received_at_ms,
      read, starred, folder_id, label_ids_json, category_ids_json
    ON effective_messages
    BEGIN
      ${DELETE_OLD_MEMBERSHIPS}
      ${insertMemberships("NEW")}
    END;
  `);
  await tx.execute(
    "INSERT INTO schema_migrations(id, name) VALUES (3, '0003-message-membership-index')",
  );
}

// Backfill reads every stored message; triggers read the changed row.
function insertMemberships(row: "m" | "NEW") {
  const from = row === "m" ? "effective_messages AS m, " : "";
  const folderFrom = row === "m" ? "FROM effective_messages AS m" : "";
  const columns = `${row}.account_id, ${row}.message_id, ${row}.conversation_id, ${row}.received_at_ms, ${row}.read, ${row}.starred`;
  return `INSERT OR IGNORE INTO effective_message_memberships(
      account_id, message_id, conversation_id, received_at_ms, read, starred,
      kind, membership_id
    )
    SELECT ${columns}, 'label', labels.value
    FROM ${from}json_each(${row}.label_ids_json) AS labels
    UNION ALL
    SELECT ${columns}, 'category', categories.value
    FROM ${from}json_each(${row}.category_ids_json) AS categories
    UNION ALL
    SELECT ${columns}, 'folder', ${row}.folder_id
    ${folderFrom}
    WHERE ${row}.folder_id IS NOT NULL;`;
}
