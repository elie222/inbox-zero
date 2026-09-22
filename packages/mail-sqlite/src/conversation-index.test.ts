import { describe, expect, it } from "vitest";
import { createNodeSqliteDriver } from "./node-sqlite";
import { createSqliteMailStore } from "./store";
import { migrateConversationIndex } from "./conversation-index";
import type { SqlTransaction } from "./driver";

describe("transactional conversation index", () => {
  it("shows the same conversation preview for equivalent inbox filters", async () => {
    const driver = createNodeSqliteDriver();
    const store = await createSqliteMailStore(driver);
    try {
      await store.ensureAccount({
        accountId: "a",
        provider: "google",
        generation: "g",
      });
      await driver.write(async (tx) => {
        await insertMessage(tx, "inbound", "conversation", 1, 0);
        await insertMessage(tx, "reply", "conversation", 2, 1);
        await tx.execute(
          `UPDATE effective_messages SET roles_json = '["sent"]', in_inbox = 0,
           in_sent = 1, preview = 'My latest reply', from_address = 'me@example.com'
           WHERE message_id = 'reply'`,
        );
      });
      const query = {
        accountIds: ["a"],
        predicate: { kind: "role" as const, role: "inbox" as const },
        order: "newest_first" as const,
        pageSize: 25,
        after: null,
      };
      const indexed = await store.readMailboxView(query);
      const composed = await store.readMailboxView({
        ...query,
        predicate: { kind: "all", predicates: [query.predicate] },
      });
      expect(indexed).toEqual(composed);
      expect(indexed.view.conversations[0]).toMatchObject({
        preview: "My latest reply",
        from: "me@example.com",
        unread: true,
      });
    } finally {
      await store.close();
    }
  });

  it("tracks role counts, moves and rollback without a separate publication", async () => {
    const driver = createNodeSqliteDriver();
    const store = await createSqliteMailStore(driver);
    try {
      await store.ensureAccount({
        accountId: "a",
        provider: "google",
        generation: "g",
      });
      await driver.write(async (tx) => {
        await insertMessage(tx, "m1", "c1", 1, 0);
        await insertMessage(tx, "m2", "c1", 2, 1);
      });
      const query = {
        accountIds: ["a"],
        predicate: { kind: "role" as const, role: "inbox" as const },
        order: "newest_first" as const,
        pageSize: 25,
        after: null,
      };
      const initial = await store.readMailboxView(query);
      expect(initial.view.counts).toMatchObject({
        matchingConversations: 1,
        unreadConversations: 1,
      });
      expect(initial.view.conversations[0]?.latestMessageAtMs).toBe(2);
      await expect(
        driver.write(async (tx) => {
          await tx.execute("DELETE FROM effective_messages");
          throw new Error("simulated interruption");
        }),
      ).rejects.toThrow("simulated interruption");
      expect((await store.readMailboxView(query)).view).toEqual(initial.view);
      await driver.write((tx) =>
        tx.execute(
          "UPDATE effective_messages SET conversation_id = 'c2' WHERE message_id = 'm2'",
        ),
      );
      expect((await store.readMailboxView(query)).view.counts).toMatchObject({
        matchingConversations: 2,
        unreadConversations: 1,
      });
      await driver.write((tx) =>
        tx.execute(
          "UPDATE effective_messages SET in_inbox = 0, roles_json = '[]' WHERE message_id = 'm1'",
        ),
      );
      const archived = await store.readMailboxView(query);
      expect(archived.view.counts).toMatchObject({
        matchingConversations: 1,
        unreadConversations: 0,
      });
      expect(
        archived.view.conversations.map((row) => row.key.conversationId),
      ).toEqual(["c2"]);
      await driver.write((tx) => tx.execute("DELETE FROM effective_messages"));
      expect(
        (await store.readMailboxView(query)).view.counts.matchingConversations,
      ).toBe(0);
    } finally {
      await store.close();
    }
  });

  it("backfills an existing mailbox once", async () => {
    const driver = createNodeSqliteDriver();
    const store = await createSqliteMailStore(driver);
    try {
      await store.ensureAccount({
        accountId: "a",
        provider: "google",
        generation: "g",
      });
      await driver.write(async (tx) => {
        for (const event of ["insert", "delete", "update"]) {
          await tx.exec(`DROP TRIGGER effective_conversations_after_${event}`);
        }
        await tx.exec(
          "DROP TABLE effective_role_conversations; DELETE FROM schema_migrations WHERE id = 2;",
        );
        await insertMessage(tx, "m1", "c1", 1, 0);
        await migrateConversationIndex(tx);
        await migrateConversationIndex(tx);
      });
      const rows = await driver.read((tx) =>
        tx.query(
          "SELECT conversation_id, unread FROM effective_role_conversations",
        ),
      );
      expect(rows).toEqual([{ conversation_id: "c1", unread: 1 }]);
    } finally {
      await store.close();
    }
  });
});

async function insertMessage(
  tx: SqlTransaction,
  id: string,
  conversation: string,
  received: number,
  read: number,
) {
  await tx.execute(
    `INSERT INTO effective_messages(
      account_id, message_id, conversation_id, subject, preview, from_address, to_json,
      received_at_ms, read, starred, folder_id, label_ids_json, category_ids_json, roles_json,
      in_inbox, in_sent, in_draft, in_trash, in_spam, has_attachments, pending_operation_ids_json
    ) VALUES ('a', ?, ?, 'Subject', 'Preview', 'sender@example.com', '[]', ?, ?, 0,
      NULL, '[]', '[]', '["inbox"]', 1, 0, 0, 0, 0, 0, '[]')`,
    [id, conversation, received, read],
  );
}
