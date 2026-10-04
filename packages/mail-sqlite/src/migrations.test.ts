import { describe, expect, it } from "vitest";
import { MAILBOX_SCHEMA_SQL, migrateMailbox } from "./migrations";
import { createNodeSqliteDriver } from "./node-sqlite";
import {
  migrateConversationIndex,
  migrateMembershipIndex,
} from "./conversation-index";

describe("Fastmail mailbox migration", () => {
  it("preserves populated indexes from an already migrated mailbox", async () => {
    const driver = createNodeSqliteDriver();
    try {
      await driver.write(async (tx) => {
        await tx.exec(MAILBOX_SCHEMA_SQL.replace(", 'fastmail'", ""));
        await migrateConversationIndex(tx);
        await migrateMembershipIndex(tx);
        await tx.exec(`
          INSERT INTO accounts(account_id, provider, generation) VALUES ('existing', 'google', 'g1');
          INSERT INTO effective_messages (
            account_id, message_id, conversation_id, subject, preview,
            from_address, to_json, received_at_ms, read, starred, folder_id,
            label_ids_json, category_ids_json, roles_json, in_inbox, in_sent,
            in_draft, in_trash, in_spam, has_attachments, pending_operation_ids_json
          ) VALUES (
            'existing', 'message', 'conversation', 'Subject', '',
            'sender@example.com', '[]', 1000, 0, 1, 'folder',
            '["label"]', '["category"]', '["inbox"]', 1, 0,
            0, 0, 0, 0, '[]'
          );
          INSERT INTO schema_migrations(id, name) VALUES (5, '0005-inbox-unread-excludes-archive');
        `);
      });
      const before = await driver.read(async (tx) => ({
        conversations: await tx.query(
          "SELECT * FROM effective_role_conversations",
        ),
        memberships: await tx.query(
          "SELECT * FROM effective_message_memberships",
        ),
      }));
      expect(before.conversations).toHaveLength(1);
      expect(before.memberships).toHaveLength(3);
      await driver.write((tx) => migrateMailbox(tx, "epoch"));
      await driver.write((tx) => migrateMailbox(tx, "epoch"));
      await driver.read(async (tx) => {
        expect(
          await tx.query("SELECT * FROM effective_role_conversations"),
        ).toEqual(before.conversations);
        expect(
          await tx.query("SELECT * FROM effective_message_memberships"),
        ).toEqual(before.memberships);
        expect(await tx.query("PRAGMA foreign_key_check")).toEqual([]);
      });
    } finally {
      await driver.close();
    }
  });

  it.each([
    false,
    true,
  ])("accepts Fastmail and preserves references (legacy=%s)", async (legacy) => {
    const driver = createNodeSqliteDriver();
    try {
      await driver.write(async (tx) => {
        await tx.exec(
          legacy
            ? MAILBOX_SCHEMA_SQL.replace(", 'fastmail'", "")
            : MAILBOX_SCHEMA_SQL,
        );
        await tx.exec(
          "INSERT INTO accounts(account_id, provider, generation, assistant_cursor) VALUES ('existing', 'google', 'g1', 'cursor')",
        );
        await tx.exec(
          "CREATE TABLE migration_reference (account_id TEXT REFERENCES accounts(account_id)); INSERT INTO migration_reference VALUES ('existing')",
        );
      });
      await driver.write((tx) => migrateMailbox(tx, "epoch"));
      await driver.write(async (tx) => {
        await tx.exec(
          "INSERT INTO accounts(account_id, provider, generation) VALUES ('fastmail', 'fastmail', 'g1')",
        );
      });
      await driver.write((tx) => migrateMailbox(tx, "epoch"));
      await driver.read(async (tx) => {
        expect(
          await tx.query(
            "SELECT provider, assistant_cursor FROM accounts WHERE account_id = 'existing'",
          ),
        ).toEqual([{ provider: "google", assistant_cursor: "cursor" }]);
        expect(
          await tx.query("SELECT account_id FROM migration_reference"),
        ).toEqual([{ account_id: "existing" }]);
        expect(await tx.query("PRAGMA foreign_key_check")).toEqual([]);
        expect(await tx.query("PRAGMA foreign_keys")).toEqual([
          { foreign_keys: 1 },
        ]);
      });
    } finally {
      await driver.close();
    }
  });
});
