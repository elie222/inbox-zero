import { describe, expect, it } from "vitest";
import { createNodeSqliteDriver } from "./node-sqlite";
import { createSqliteMailStore } from "./store";
import {
  MAILBOX_SCHEMA_SQL,
  migrateMailbox,
  migrateEmptyMeetingInvitationBodies,
} from "./migrations";

describe("migrateEmptyMeetingInvitationBodies", () => {
  it("drops only invitation bodies stored without content, once", async () => {
    const driver = createNodeSqliteDriver();
    const store = await createSqliteMailStore(driver);
    try {
      await driver.write(async (tx) => {
        await tx.exec("DELETE FROM schema_migrations WHERE id = 9");
        const insert = (
          id: string,
          html: string | null,
          attachments: string,
          invitation: number,
        ) =>
          tx.execute(
            "INSERT INTO message_content(account_id, message_id, version, html, text, attachments_json, is_meeting_invitation) VALUES ('a', ?, '1', ?, NULL, ?, ?)",
            [id, html, attachments, invitation],
          );
        await insert("empty-invite", null, "[]", 1);
        await insert("invite-with-body", "<p>Join</p>", "[]", 1);
        await insert("invite-with-ics", null, '[{"attachmentId":"att-1"}]', 1);
        await insert("empty-message", null, "[]", 0);
        await migrateEmptyMeetingInvitationBodies(tx);
        await insert("later-empty-invite", null, "[]", 1);
        await migrateEmptyMeetingInvitationBodies(tx);
      });
      const rows = await driver.read((tx) =>
        tx.query("SELECT message_id FROM message_content ORDER BY message_id"),
      );
      expect(rows.map((row) => row.message_id)).toEqual([
        "empty-message",
        "invite-with-body",
        "invite-with-ics",
        "later-empty-invite",
      ]);
    } finally {
      await store.close();
    }
  });
});

describe("iCloud provider migration", () => {
  it("upgrades existing caches without losing messages or foreign-key enforcement", async () => {
    const driver = createNodeSqliteDriver();
    try {
      await driver.write(async (tx) => {
        await tx.exec(
          MAILBOX_SCHEMA_SQL.replace(
            "'google', 'microsoft', 'icloud'",
            "'google', 'microsoft'",
          ),
        );
        await tx.exec(`
          INSERT INTO accounts(account_id, provider, generation, assistant_cursor) VALUES ('existing', 'google', 'g1', 'saved-cursor');
          INSERT INTO messages(account_id, message_id, conversation_id, provider, subject, preview, from_address, to_json, cc_json, received_at_ms, read, starred, label_ids_json, category_ids_json, roles_json, in_inbox, in_sent, in_draft, in_trash, in_spam, has_attachments)
          VALUES ('existing', 'kept-message', 'thread', 'google', 'Kept subject', '', 'fixture@example.test', '[]', '[]', 1, 0, 0, '[]', '[]', '[]', 1, 0, 0, 0, 0, 0);
        `);
        await migrateMailbox(tx, "epoch");
        await migrateMailbox(tx, "epoch");
        await tx.exec(
          "INSERT INTO accounts(account_id, provider, generation) VALUES ('new', 'icloud', 'g2')",
        );
      });
      expect(
        await driver.read((tx) =>
          tx.query(
            "SELECT provider, assistant_cursor FROM accounts WHERE account_id = 'existing'",
          ),
        ),
      ).toEqual([{ provider: "google", assistant_cursor: "saved-cursor" }]);
      expect(
        await driver.read((tx) =>
          tx.query(
            "SELECT subject FROM messages WHERE message_id = 'kept-message'",
          ),
        ),
      ).toEqual([{ subject: "Kept subject" }]);
      expect(
        await driver.read((tx) => tx.query("PRAGMA foreign_key_check")),
      ).toEqual([]);
      await expect(
        driver.write((tx) =>
          tx.exec("UPDATE messages SET account_id = 'missing'"),
        ),
      ).rejects.toThrow();
      await expect(
        driver.write((tx) =>
          tx.exec(
            "INSERT INTO accounts(account_id, provider, generation) VALUES ('bad', 'unsupported', 'g1')",
          ),
        ),
      ).rejects.toThrow();
    } finally {
      await driver.close();
    }
  });
  it("accepts iCloud in a fresh cache", async () => {
    const store = await createSqliteMailStore(createNodeSqliteDriver());
    try {
      await store.ensureAccount({
        accountId: "icloud",
        provider: "icloud",
        generation: "g1",
      });
    } finally {
      await store.close();
    }
  });
});
