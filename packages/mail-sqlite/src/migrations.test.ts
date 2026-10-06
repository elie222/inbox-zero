import { describe, expect, it } from "vitest";
import { createNodeSqliteDriver } from "./node-sqlite";
import { createSqliteMailStore } from "./store";
import { migrateEmptyMeetingInvitationBodies } from "./migrations";

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
