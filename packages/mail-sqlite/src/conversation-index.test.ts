import { describe, expect, it } from "vitest";
import { createNodeSqliteDriver } from "./node-sqlite";
import { createSqliteMailStore } from "./store";
import {
  migrateConversationIndex,
  migrateMembershipIndex,
} from "./conversation-index";
import type { SqlTransaction } from "./driver";
import type {
  MailboxCountsQuery,
  MailPredicate,
} from "@inboxzero/mail-core/queries";

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
        {
          kind: "all",
          predicates: [
            { kind: "membership", membership: "label", id: "Label_1" },
            { kind: "mailbox", mailbox: "all" },
          ],
        },
      ] satisfies MailPredicate[];
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
            predicate: filteredPath(predicate),
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

  it("drops a trashed or spam message from a label's view and restores it", async () => {
    const driver = createNodeSqliteDriver();
    const store = await createSqliteMailStore(driver);
    try {
      await store.ensureAccount({
        accountId: "a",
        provider: "google",
        generation: "g",
      });
      await driver.write(async (tx) => {
        await insertMessage(tx, "m1", "c1", 1, 0, { labels: ["Label_1"] });
        await insertMessage(tx, "m2", "c1", 3, 1, { labels: ["Label_1"] });
        await insertMessage(tx, "m3", "c2", 2, 0, { labels: ["Label_1"] });
      });
      const predicate: MailPredicate = {
        kind: "all",
        predicates: [
          { kind: "membership", membership: "label", id: "Label_1" },
          { kind: "mailbox", mailbox: "all" },
        ],
      };
      const query = {
        accountIds: ["a"],
        predicate,
        order: "newest_first" as const,
        pageSize: 25,
        after: null,
      };
      const read = async () => {
        const indexed = await store.readMailboxView(query);
        expect(indexed).toEqual(
          await store.readMailboxView({
            ...query,
            predicate: filteredPath(predicate),
          }),
        );
        const counts = await store.readMailboxCounts({
          accountIds: ["a"],
          targets: [{ id: "label", predicate }],
        });
        expect(counts.view.counts[0]).toMatchObject({
          matchingConversations: indexed.view.counts.matchingConversations,
          unreadConversations: indexed.view.counts.unreadConversations,
        });
        return {
          conversations: indexed.view.conversations.map((conversation) => ({
            id: conversation.key.conversationId,
            latest: conversation.latestMessageAtMs,
            unread: conversation.unread,
          })),
          counts: indexed.view.counts,
        };
      };
      const move = (
        message: string,
        column: "in_trash" | "in_spam",
        value: 0 | 1,
      ) =>
        driver.write((tx) =>
          tx.execute(
            `UPDATE effective_messages SET ${column} = ? WHERE message_id = ?`,
            [value, message],
          ),
        );

      const before = await read();
      expect(before).toMatchObject({
        conversations: [
          { id: "c1", latest: 3, unread: true },
          { id: "c2", latest: 2, unread: true },
        ],
        counts: { matchingConversations: 2, unreadConversations: 2 },
      });

      await move("m3", "in_trash", 1);
      await move("m1", "in_spam", 1);
      expect(await read()).toMatchObject({
        conversations: [{ id: "c1", latest: 3, unread: false }],
        counts: { matchingConversations: 1, unreadConversations: 0 },
      });

      await move("m3", "in_trash", 0);
      await move("m1", "in_spam", 0);
      expect(await read()).toEqual(before);
    } finally {
      await store.close();
    }
  });

  it("serves a label's read and starred filters like filtering every message", async () => {
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
        const label = { labels: ["Label_1"] };
        // Unread and starred only through an older message.
        await insertMessage(tx, "m1", "c1", 1, 0, { ...label, starred: true });
        await insertMessage(tx, "m2", "c1", 9, 1, label);
        // Its newest message is unread but in Trash.
        await insertMessage(tx, "m3", "c2", 2, 1, label);
        await insertMessage(tx, "m4", "c2", 8, 0, {
          ...label,
          roles: ["trash"],
        });
        // Starred and unread only in Spam.
        await insertMessage(tx, "m5", "c3", 3, 1, label);
        await insertMessage(tx, "m6", "c3", 7, 0, {
          ...label,
          roles: ["spam"],
          starred: true,
        });
        // Unread through a message outside the label.
        await insertMessage(tx, "m7", "c4", 4, 1, label);
        await insertMessage(tx, "m8", "c4", 6, 0);
        // Entirely in Trash.
        await insertMessage(tx, "m9", "c5", 5, 0, {
          ...label,
          roles: ["trash"],
        });
        await insertMessage(tx, "m10", "c6", 10, 0, {
          ...label,
          account: "b",
          starred: true,
          folder: "f1",
        });
        await insertMessage(tx, "m11", "c7", 11, 1, {
          ...label,
          account: "b",
          folder: "f1",
        });
      });
      const labelMembership: MailPredicate = {
        kind: "membership",
        membership: "label",
        id: "Label_1",
      };
      const labelView: MailPredicate = {
        kind: "all",
        predicates: [labelMembership, { kind: "mailbox", mailbox: "all" }],
      };
      const unread: MailPredicate = { kind: "read", value: false };
      const starred: MailPredicate = { kind: "starred", value: true };
      // The shapes threadsQueryToPredicate builds in apps/web: a label's view
      // nested after the other conditions, and labelIds as flat clauses.
      const predicates: MailPredicate[] = [
        labelView,
        { kind: "all", predicates: [unread, labelView] },
        { kind: "all", predicates: [{ kind: "read", value: true }, labelView] },
        {
          kind: "all",
          predicates: [{ kind: "mailbox", mailbox: "starred" }, labelView],
        },
        { kind: "all", predicates: [unread, starred, labelView] },
        { kind: "all", predicates: [labelMembership, unread] },
        { kind: "all", predicates: [labelMembership, starred] },
        {
          kind: "all",
          predicates: [
            unread,
            { kind: "membership", membership: "folder", id: "f1" },
          ],
        },
        {
          kind: "all",
          predicates: [unread, { ...labelMembership, accountId: "b" }],
        },
      ];
      for (const predicate of predicates) {
        const counts = async (path: MailPredicate) =>
          (
            await store.readMailboxCounts({
              accountIds: ["a", "b"],
              targets: [{ id: "label", predicate: path }],
            })
          ).view.counts;
        expect(await counts(predicate)).toEqual(
          await counts(filteredPath(predicate)),
        );
        const pages = async (path: MailPredicate) => {
          const read = [];
          let after: string | null = null;
          do {
            const page = await store.readMailboxView({
              accountIds: ["a", "b"],
              predicate: path,
              order: "newest_first",
              pageSize: 2,
              after,
            });
            read.push(page.view);
            after = page.view.nextPage;
          } while (after);
          return read;
        };
        expect(await pages(predicate)).toEqual(
          await pages(filteredPath(predicate)),
        );
      }
      const unreadLabel = await store.readMailboxView({
        accountIds: ["a", "b"],
        predicate: { kind: "all", predicates: [unread, labelView] },
        order: "newest_first",
        pageSize: 25,
        after: null,
      });
      expect(
        unreadLabel.view.conversations.map((conversation) => ({
          id: conversation.key.conversationId,
          latest: conversation.latestMessageAtMs,
          starred: conversation.starred,
        })),
      ).toEqual([
        { id: "c6", latest: 10, starred: true },
        { id: "c1", latest: 1, starred: true },
      ]);
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

  it.each([
    "the first version of the index",
    "no index",
  ])("builds the membership index once from %s", async (existing) => {
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
          "DROP TABLE effective_message_memberships; DELETE FROM schema_migrations WHERE id = 11;",
        );
        await insertMessage(tx, "m1", "c1", 1, 0, { labels: ["Label_1"] });
        await insertMessage(tx, "m2", "c2", 2, 1, {
          labels: ["Label_1"],
          roles: ["trash"],
        });
        if (existing === "the first version of the index") {
          await tx.exec(
            `CREATE TABLE effective_message_memberships (
               account_id TEXT NOT NULL,
               kind TEXT NOT NULL,
               membership_id TEXT NOT NULL,
               message_id TEXT NOT NULL,
               conversation_id TEXT NOT NULL,
               received_at_ms INTEGER NOT NULL,
               read INTEGER NOT NULL,
               starred INTEGER NOT NULL,
               PRIMARY KEY (account_id, kind, membership_id, message_id)
             );
             CREATE INDEX message_memberships_by_message
               ON effective_message_memberships(account_id, message_id);
             INSERT INTO effective_message_memberships
               SELECT account_id, 'label', 'Label_1', message_id, conversation_id,
                      received_at_ms, read, starred
               FROM effective_messages;`,
          );
        }
        await migrateMembershipIndex(tx);
        await migrateMembershipIndex(tx);
      });
      const rows = await driver.read((tx) =>
        tx.query(
          "SELECT kind, membership_id, message_id, read, in_trash_or_spam FROM effective_message_memberships",
        ),
      );
      expect(rows).toEqual([
        {
          kind: "label",
          membership_id: "Label_1",
          message_id: "m1",
          read: 0,
          in_trash_or_spam: 0,
        },
        {
          kind: "label",
          membership_id: "Label_1",
          message_id: "m2",
          read: 1,
          in_trash_or_spam: 1,
        },
      ]);
    } finally {
      await store.close();
    }
  });

  it("does not count archived unread mail as inbox unread", async () => {
    const driver = createNodeSqliteDriver();
    const store = await createSqliteMailStore(driver);
    try {
      await store.ensureAccount({
        accountId: "a",
        provider: "google",
        generation: "g",
      });
      await driver.write(async (tx) => {
        await insertMessage(tx, "archived", "archived-thread", 1, 0, {
          roles: [],
        });
        await insertMessage(tx, "inbox-read", "mixed-thread", 2, 1);
        await insertMessage(tx, "archived-unread", "mixed-thread", 3, 0, {
          roles: [],
        });
        await insertMessage(tx, "archive-label", "archive-label-thread", 4, 0, {
          labels: ["ARCHIVE"],
        });
        await insertMessage(tx, "left-inbox", "left-thread", 5, 0);
        await tx.execute(
          "UPDATE effective_messages SET in_inbox = 0 WHERE message_id = 'left-inbox'",
        );
        await insertMessage(tx, "inbox-unread", "open-thread", 6, 0);
      });
      const counts = await store.readMailboxCounts({
        accountIds: ["a"],
        targets: [{ id: "INBOX", predicate: { kind: "role", role: "inbox" } }],
      });
      expect(counts.view.counts).toEqual([
        { id: "INBOX", matchingConversations: 2, unreadConversations: 1 },
      ]);
    } finally {
      await store.close();
    }
  });

  it.each([
    "delete",
    "update",
  ])("finds a message's memberships through its own index on %s", async (event) => {
    const driver = createNodeSqliteDriver();
    await createSqliteMailStore(driver);
    try {
      const plan = await driver.read(async (tx) => {
        const [trigger] = await tx.query(
          "SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?",
          [`effective_memberships_after_${event}`],
        );
        const deleteOld = String(trigger?.sql)
          .match(/DELETE FROM effective_message_memberships[\s\S]*?\);/)?.[0]
          .replace(/OLD\.(\w+)/g, "'$1'");
        return tx.query(`EXPLAIN QUERY PLAN ${deleteOld}`);
      });
      const steps = plan.map((row) => String(row.detail));
      // Without statistics, a plain account-and-message filter scans every
      // membership in the account through the primary key's prefix.
      expect(steps).toContainEqual(
        expect.stringContaining(
          "INDEX message_memberships_by_message (account_id=? AND message_id=?)",
        ),
      );
      expect(steps).not.toContainEqual(
        expect.stringMatching(/PRIMARY KEY \(account_id=\?\)$/),
      );
    } finally {
      await driver.close();
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
    roles?: string[];
    starred?: boolean;
  } = {},
) {
  const roles = options.roles ?? (options.draft ? ["draft"] : ["inbox"]);
  const inInbox = roles.includes("inbox") ? 1 : 0;
  const inDraft = roles.includes("draft") ? 1 : 0;
  const inTrash = roles.includes("trash") ? 1 : 0;
  const inSpam = roles.includes("spam") ? 1 : 0;
  await tx.execute(
    `INSERT INTO effective_messages(
      account_id, message_id, conversation_id, subject, preview, from_address, to_json,
      received_at_ms, read, starred, folder_id, label_ids_json, category_ids_json, roles_json,
      in_inbox, in_sent, in_draft, in_trash, in_spam, has_attachments, snoozed_until_ms,
      pending_operation_ids_json
    ) VALUES (?, ?, ?, 'Subject', 'Preview', 'sender@example.com', '[]', ?, ?, ?,
      ?, ?, ?, ?, ?, 0, ?, ?, ?, 0, ?, '[]')`,
    [
      options.account ?? "a",
      id,
      conversation,
      received,
      read,
      options.starred ? 1 : 0,
      options.folder ?? null,
      JSON.stringify(options.labels ?? []),
      JSON.stringify(options.categories ?? []),
      JSON.stringify(roles),
      inInbox,
      inDraft,
      inTrash,
      inSpam,
      options.snoozedUntil ?? null,
    ],
  );
}

// An always-true clause no index recognizes, so the read filters every message.
// Nesting keeps a top-level membership or role from choosing a narrower source.
function filteredPath(predicate: MailPredicate): MailPredicate {
  return {
    kind: "all",
    predicates: [
      { kind: "all", predicates: [predicate] },
      { kind: "not", predicate: { kind: "message", ids: [] } },
    ],
  };
}
