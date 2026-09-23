import { describe, expect, it } from "vitest";
import { createNodeSqliteDriver } from "./node-sqlite";
import { createSqliteMailStore } from "./store";
import {
  migrateConversationIndex,
  migrateMembershipIndex,
} from "./conversation-index";
import type { SqlTransaction } from "./driver";
import type { MailboxCountsQuery } from "@inboxzero/mail-core/queries";

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

  it("serves label, category, folder, and draft views like the unindexed filter", async () => {
    const driver = createNodeSqliteDriver();
    const store = await createSqliteMailStore(driver);
    try {
      await store.ensureAccount({
        accountId: "a",
        provider: "google",
        generation: "g",
      });
      await driver.write(async (tx) => {
        await insertMessage(tx, "m1", "c1", 1, 0, {
          labels: ["Label_1"],
          categories: ["CATEGORY_UPDATES"],
          folder: "f1",
        });
        await insertMessage(tx, "m2", "c1", 3, 1, { labels: ["Label_1"] });
        await insertMessage(tx, "m3", "c2", 2, 1, {
          labels: ["Label_1", "Label_2"],
          folder: "f1",
        });
        await insertMessage(tx, "m4", "c3", 4, 1, { draft: true });
      });
      const predicates = [
        { kind: "membership", membership: "label", id: "Label_1" },
        { kind: "membership", membership: "label", id: "Label_2" },
        {
          kind: "membership",
          membership: "label",
          id: "Label_1",
          accountId: "a",
        },
        { kind: "membership", membership: "category", id: "CATEGORY_UPDATES" },
        { kind: "membership", membership: "folder", id: "f1" },
        { kind: "role", role: "draft" },
      ] as const;
      const compare = async () => {
        for (const predicate of predicates) {
          const query = {
            accountIds: ["a"],
            predicate,
            order: "newest_first" as const,
            pageSize: 25,
            after: null,
          };
          const composed = await store.readMailboxView({
            ...query,
            predicate: { kind: "all", predicates: [predicate] },
          });
          expect(await store.readMailboxView(query)).toEqual(composed);
        }
      };
      await compare();
      await driver.write((tx) =>
        tx.execute(
          "UPDATE effective_messages SET label_ids_json = '[]' WHERE message_id = 'm1'",
        ),
      );
      await compare();
      const label = await store.readMailboxView({
        accountIds: ["a"],
        predicate: { kind: "membership", membership: "label", id: "Label_1" },
        order: "newest_first",
        pageSize: 25,
        after: null,
      });
      expect(label.view.counts).toMatchObject({
        matchingConversations: 2,
        unreadConversations: 0,
      });
    } finally {
      await store.close();
    }
  });

  it("counts every target for all requested accounts in one read", async () => {
    const driver = createNodeSqliteDriver();
    const store = await createSqliteMailStore(driver);
    try {
      for (const accountId of ["a", "b"]) {
        await store.ensureAccount({
          accountId,
          provider: "google",
          generation: "g",
        });
      }
      await driver.write(async (tx) => {
        await insertMessage(tx, "m1", "c1", 1, 0, {
          labels: ["Label_1"],
          categories: ["CATEGORY_UPDATES"],
          folder: "f1",
        });
        await insertMessage(tx, "m2", "c1", 3, 1, { labels: ["Label_1"] });
        await insertMessage(tx, "m3", "c2", 2, 1, {
          labels: ["Label_1"],
          folder: "f1",
        });
        await insertMessage(tx, "m4", "c3", 4, 0, { draft: true });
        await insertMessage(tx, "m5", "c4", 5, 0, { labels: ["Label_2"] });
        // Only the read message is snoozed, so the snoozed view shows the
        // conversation but not as unread.
        await insertMessage(tx, "m6", "c5", 6, 1, {
          snoozedUntil: Date.now() + 60_000,
        });
        await insertMessage(tx, "m7", "c5", 7, 0);
        await insertMessage(tx, "m8", "c1", 8, 0, {
          account: "b",
          labels: ["Label_1"],
        });
      });
      const targets: MailboxCountsQuery["targets"] = [
        { id: "inbox", predicate: { kind: "role", role: "inbox" } },
        { id: "draft", predicate: { kind: "role", role: "draft" } },
        {
          id: "label",
          predicate: { kind: "membership", membership: "label", id: "Label_1" },
        },
        {
          id: "label-account-a",
          predicate: {
            kind: "membership",
            membership: "label",
            id: "Label_1",
            accountId: "a",
          },
        },
        {
          id: "category",
          predicate: {
            kind: "membership",
            membership: "category",
            id: "CATEGORY_UPDATES",
          },
        },
        {
          id: "folder",
          predicate: { kind: "membership", membership: "folder", id: "f1" },
        },
        {
          id: "unread-inbox",
          predicate: {
            kind: "all",
            predicates: [
              { kind: "role", role: "inbox" },
              { kind: "read", value: false },
            ],
          },
        },
        { id: "archive", predicate: { kind: "mailbox", mailbox: "archive" } },
        { id: "snoozed", predicate: { kind: "mailbox", mailbox: "snoozed" } },
      ];

      const result = await store.readMailboxCounts({
        accountIds: ["a", "b"],
        targets,
      });

      expect(result.view.counts).toEqual([
        { id: "inbox", matchingConversations: 5, unreadConversations: 4 },
        { id: "draft", matchingConversations: 1, unreadConversations: 1 },
        { id: "label", matchingConversations: 3, unreadConversations: 2 },
        {
          id: "label-account-a",
          matchingConversations: 2,
          unreadConversations: 1,
        },
        { id: "category", matchingConversations: 1, unreadConversations: 1 },
        { id: "folder", matchingConversations: 2, unreadConversations: 1 },
        {
          id: "unread-inbox",
          matchingConversations: 4,
          unreadConversations: 4,
        },
        { id: "archive", matchingConversations: 1, unreadConversations: 1 },
        { id: "snoozed", matchingConversations: 1, unreadConversations: 0 },
      ]);
    } finally {
      await store.close();
    }
  });

  it("backfills memberships for an existing mailbox once", async () => {
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
          await tx.exec(`DROP TRIGGER effective_memberships_after_${event}`);
        }
        await tx.exec(
          "DROP TABLE effective_message_memberships; DELETE FROM schema_migrations WHERE id = 3;",
        );
        await insertMessage(tx, "m1", "c1", 1, 0, { labels: ["Label_1"] });
        await migrateMembershipIndex(tx);
        await migrateMembershipIndex(tx);
      });
      const rows = await driver.read((tx) =>
        tx.query(
          "SELECT kind, membership_id, message_id, read FROM effective_message_memberships",
        ),
      );
      expect(rows).toEqual([
        {
          kind: "label",
          membership_id: "Label_1",
          message_id: "m1",
          read: 0,
        },
      ]);
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
  options: {
    account?: string;
    labels?: string[];
    categories?: string[];
    folder?: string;
    draft?: boolean;
    snoozedUntil?: number;
  } = {},
) {
  await tx.execute(
    `INSERT INTO effective_messages(
      account_id, message_id, conversation_id, subject, preview, from_address, to_json,
      received_at_ms, read, starred, folder_id, label_ids_json, category_ids_json, roles_json,
      in_inbox, in_sent, in_draft, in_trash, in_spam, has_attachments, snoozed_until_ms,
      pending_operation_ids_json
    ) VALUES (?, ?, ?, 'Subject', 'Preview', 'sender@example.com', '[]', ?, ?, 0,
      ?, ?, ?, ?, ?, 0, ?, 0, 0, 0, ?, '[]')`,
    [
      options.account ?? "a",
      id,
      conversation,
      received,
      read,
      options.folder ?? null,
      JSON.stringify(options.labels ?? []),
      JSON.stringify(options.categories ?? []),
      options.draft ? '["draft"]' : '["inbox"]',
      options.draft ? 0 : 1,
      options.draft ? 1 : 0,
      options.snoozedUntil ?? null,
    ],
  );
}
