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

  await installConversationTriggers(tx);
  await tx.execute(
    "INSERT INTO schema_migrations(id, name) VALUES (2, '0002-role-conversation-index')",
  );
}

// Existing mailboxes kept inbox role on messages that had already left the
// inbox, so the dock badge counted archived unread conversations.
export async function migrateInboxUnreadExcludesArchive(tx: SqlTransaction) {
  const applied = await tx.query(
    "SELECT 1 FROM schema_migrations WHERE id = 5",
  );
  if (applied.length) return;

  const indexed = await tx.query(
    "SELECT 1 FROM schema_migrations WHERE id = 2",
  );
  if (indexed.length) {
    for (const event of ["insert", "delete", "update"]) {
      await tx.exec(
        `DROP TRIGGER IF EXISTS effective_conversations_after_${event}`,
      );
    }
    await tx.exec(`
      ${clearArchiveInboxRole("messages")}
      ${clearArchiveInboxRole("effective_messages")}
      DELETE FROM effective_role_conversations;
      ${rebuildConversations("1 = 1")}
    `);
    await installConversationTriggers(tx);
  }
  await tx.execute(
    "INSERT INTO schema_migrations(id, name) VALUES (5, '0005-inbox-unread-excludes-archive')",
  );
}

async function installConversationTriggers(tx: SqlTransaction) {
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
}

function rebuildConversations(predicate: string) {
  return `INSERT INTO effective_role_conversations(
      account_id, conversation_id, role, latest_at_ms, unread, starred
    )
    SELECT account_id, conversation_id, roles.value,
           MAX(received_at_ms), MAX(1 - read), MAX(starred)
    FROM effective_messages, json_each(roles_json) AS roles
    WHERE (${predicate})
      AND NOT (
        roles.value = 'inbox'
        AND (
          effective_messages.in_inbox = 0
          OR EXISTS (
            SELECT 1 FROM json_each(effective_messages.label_ids_json) AS labels
            WHERE labels.value = 'ARCHIVE'
          )
        )
      )
    GROUP BY account_id, conversation_id, roles.value;`;
}

function clearArchiveInboxRole(table: string) {
  return `UPDATE ${table}
    SET in_inbox = 0,
        roles_json = COALESCE((
          SELECT json_group_array(value)
          FROM json_each(${table}.roles_json)
          WHERE value != 'inbox'
        ), '[]')
    WHERE EXISTS (
      SELECT 1 FROM json_each(${table}.label_ids_json) WHERE value = 'ARCHIVE'
    )
    AND (
      in_inbox = 1
      OR EXISTS (
        SELECT 1 FROM json_each(${table}.roles_json) WHERE value = 'inbox'
      )
    );`;
}

const DELETE_OLD_MEMBERSHIPS = `DELETE FROM effective_message_memberships
  WHERE account_id = OLD.account_id AND message_id = OLD.message_id;`;

// Label, category, and folder views otherwise scan every message and parse
// its label JSON, which made sidebar counts cost seconds per refresh. Rows are
// per message so each write only touches that message's rows. They are stored
// in conversation order within each membership, so a view or count reads one
// contiguous range and never visits the messages, even to leave out Trash and
// Spam. Replaces the first version of this index (migration 3), which needed a
// message lookup per row.
export async function migrateMembershipIndex(tx: SqlTransaction) {
  const applied = await tx.query(
    "SELECT 1 FROM schema_migrations WHERE id = 11",
  );
  if (applied.length) return;

  for (const event of ["insert", "delete", "update"]) {
    await tx.exec(
      `DROP TRIGGER IF EXISTS effective_memberships_after_${event}`,
    );
  }
  const previous = await tx.query(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'effective_message_memberships'",
  );
  if (previous.length) {
    await tx.exec(`
      ALTER TABLE effective_message_memberships RENAME TO previous_message_memberships;
      DROP INDEX message_memberships_by_message;
    `);
  }
  await tx.exec(`
    CREATE TABLE effective_message_memberships (
      account_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      membership_id TEXT NOT NULL,
      conversation_id TEXT NOT NULL,
      message_id TEXT NOT NULL,
      received_at_ms INTEGER NOT NULL,
      read INTEGER NOT NULL,
      starred INTEGER NOT NULL,
      in_trash_or_spam INTEGER NOT NULL,
      PRIMARY KEY (account_id, kind, membership_id, conversation_id, message_id),
      FOREIGN KEY (account_id) REFERENCES accounts(account_id) ON DELETE CASCADE
    ) WITHOUT ROWID;
    ${previous.length ? COPY_PREVIOUS_MEMBERSHIPS : insertMemberships("m")}
    CREATE INDEX message_memberships_by_message
      ON effective_message_memberships(account_id, message_id);
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
      read, starred, in_trash, in_spam, folder_id, label_ids_json,
      category_ids_json
    ON effective_messages
    BEGIN
      ${DELETE_OLD_MEMBERSHIPS}
      ${insertMemberships("NEW")}
    END;
  `);
  await tx.execute(
    "INSERT INTO schema_migrations(id, name) VALUES (11, '0011-membership-index-by-conversation')",
  );
}

// Copying the first index avoids reading every message, which took most of a
// minute on a large mailbox. Trashed and spam messages are found through the
// role index for the same reason.
const COPY_PREVIOUS_MEMBERSHIPS = `
  INSERT INTO effective_message_memberships(
    account_id, kind, membership_id, conversation_id, message_id,
    received_at_ms, read, starred, in_trash_or_spam
  )
  SELECT account_id, kind, membership_id, conversation_id, message_id,
         received_at_ms, read, starred, 0
  FROM previous_message_memberships;
  DROP TABLE previous_message_memberships;
  UPDATE effective_message_memberships SET in_trash_or_spam = 1
  WHERE (account_id, message_id) IN (
    SELECT e.account_id, e.message_id
    FROM effective_role_conversations r
    CROSS JOIN effective_messages e
      ON e.account_id = r.account_id AND e.conversation_id = r.conversation_id
    WHERE r.role IN ('trash', 'spam') AND (e.in_trash = 1 OR e.in_spam = 1)
  );`;

// Backfill reads every stored message; triggers read the changed row.
function insertMemberships(row: "m" | "NEW") {
  const from = row === "m" ? "effective_messages AS m, " : "";
  const folderFrom = row === "m" ? "FROM effective_messages AS m" : "";
  const columns = `${row}.account_id, ${row}.message_id, ${row}.conversation_id, ${row}.received_at_ms, ${row}.read, ${row}.starred, MAX(${row}.in_trash, ${row}.in_spam)`;
  return `INSERT OR IGNORE INTO effective_message_memberships(
      account_id, message_id, conversation_id, received_at_ms, read, starred,
      in_trash_or_spam, kind, membership_id
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
