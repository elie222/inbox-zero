import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { mailboxPredicate } from "@inboxzero/mail-core/queries";
import type { ProviderChange } from "@inboxzero/mail-core/sync";
import { createNodeSqliteDriver } from "./node-sqlite";
import { createSqliteMailStore } from "./store";

const fileDirectory = dirname(fileURLToPath(import.meta.url));

describe("mail client queries", () => {
  it("lists well-known mailboxes from downloaded messages", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-client-queries-"));
    const store = await createSqliteMailStore(
      createNodeSqliteDriver(join(directory, "mailbox.sqlite")),
    );
    try {
      await store.ensureAccount({
        accountId: "acc-1",
        provider: "google",
        generation: "g1",
      });
      await store.applySyncPage({
        ownerId: "owner",
        page: {
          session: { accountId: "acc-1", generation: "g1" },
          requestId: "bootstrap",
          from: { streamId: "primary", generation: "g1", checkpoint: null },
          to: { streamId: "primary", generation: "g1", checkpoint: "1" },
          changes: [
            messagePatch("m-inbox", "c-inbox", 3000, ["inbox"]),
            messagePatch("m-sent", "c-sent", 2000, ["sent"]),
            messagePatch("m-archive", "c-archive", 1000, []),
          ],
          requiredHydration: [],
          roundComplete: true,
        },
      });
      const inbox = await store.readMailboxView({
        accountIds: ["acc-1"],
        predicate: mailboxPredicate("inbox"),
        order: "newest_first",
        pageSize: 25,
        after: null,
      });
      const archive = await store.readMailboxView({
        accountIds: ["acc-1"],
        predicate: mailboxPredicate("archive"),
        order: "newest_first",
        pageSize: 25,
        after: null,
      });
      const sent = await store.readMailboxView({
        accountIds: ["acc-1"],
        predicate: mailboxPredicate("sent"),
        order: "newest_first",
        pageSize: 25,
        after: null,
      });
      expect(
        inbox.view.conversations.map((item) => item.key.conversationId),
      ).toEqual(["c-inbox"]);
      expect(
        sent.view.conversations.map((item) => item.key.conversationId),
      ).toEqual(["c-sent"]);
      expect(
        archive.view.conversations.map((item) => item.key.conversationId),
      ).toEqual(["c-sent", "c-archive"]);
      const allMail = await store.readMailboxView({
        accountIds: ["acc-1"],
        predicate: mailboxPredicate("all"),
        order: "newest_first",
        pageSize: 25,
        after: null,
      });
      expect(
        allMail.view.conversations.map((item) => item.key.conversationId),
      ).toEqual(["c-inbox", "c-sent", "c-archive"]);
      expect(["partial", "complete", "not_requested"]).toContain(
        inbox.view.coverage[0]?.indexedContent,
      );
    } finally {
      await store.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it.each([
    ["draft", "all"],
    ["trash", "inbox"],
  ] as const)("keeps the conversation title when a newer %s reply syncs", async (role, mailbox) => {
    const store = await createSqliteMailStore(
      createNodeSqliteDriver(":memory:"),
    );
    try {
      await store.ensureAccount({
        accountId: "acc-1",
        provider: "google",
        generation: "g1",
      });
      const replyDraft = messagePatch("reply-draft", "conversation", 2000, [
        role,
      ]);
      replyDraft.fields.subject = "Re: Original subject";
      const original = messagePatch("original", "conversation", 1000, [
        "inbox",
      ]);
      original.fields.subject = "Original subject";
      const newMessage = messagePatch("new-draft", "draft-only", 3000, [
        "draft",
      ]);
      newMessage.fields.subject = "New message subject";
      await store.applySyncPage({
        ownerId: "owner",
        page: {
          session: { accountId: "acc-1", generation: "g1" },
          requestId: "bootstrap",
          from: { streamId: "primary", generation: "g1", checkpoint: null },
          to: { streamId: "primary", generation: "g1", checkpoint: "1" },
          changes: [original, replyDraft, newMessage],
          requiredHydration: [],
          roundComplete: true,
        },
      });
      const result = await store.readMailboxView({
        accountIds: ["acc-1"],
        predicate: mailboxPredicate(mailbox),
        order: "newest_first",
        pageSize: 25,
        after: null,
      });
      expect(
        result.view.conversations.find(
          (row) => row.key.conversationId === "conversation",
        ),
      ).toMatchObject({
        subject: "Original subject",
        preview: "reply-draft",
        roles: ["inbox", role],
      });
      if (mailbox === "all") {
        expect(
          result.view.conversations.find(
            (row) => row.key.conversationId === "draft-only",
          )?.subject,
        ).toBe("New message subject");
      }
    } finally {
      await store.close();
    }
  });

  it("titles a conversation by its first message, not a newer reply", async () => {
    const store = await createSqliteMailStore(
      createNodeSqliteDriver(":memory:"),
    );
    try {
      await store.ensureAccount({
        accountId: "acc-1",
        provider: "google",
        generation: "g1",
      });
      const original = messagePatch("original", "conversation", 1000, [
        "inbox",
      ]);
      original.fields.subject = "Original subject";
      const reply = messagePatch("reply", "conversation", 2000, ["sent"]);
      reply.fields.subject = "Re: Original subject";
      await store.applySyncPage({
        ownerId: "owner",
        page: {
          session: { accountId: "acc-1", generation: "g1" },
          requestId: "bootstrap",
          from: { streamId: "primary", generation: "g1", checkpoint: null },
          to: { streamId: "primary", generation: "g1", checkpoint: "1" },
          changes: [original, reply],
          requiredHydration: [],
          roundComplete: true,
        },
      });
      const result = await store.readMailboxView({
        accountIds: ["acc-1"],
        predicate: mailboxPredicate("all"),
        order: "newest_first",
        pageSize: 25,
        after: null,
      });
      expect(result.view.conversations[0]).toMatchObject({
        subject: "Original subject",
        preview: "reply",
      });
    } finally {
      await store.close();
    }
  });

  it("counts archive unreads from the whole conversation", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-archive-unread-"));
    const store = await createSqliteMailStore(
      createNodeSqliteDriver(join(directory, "mailbox.sqlite")),
    );
    try {
      await store.ensureAccount({
        accountId: "acc-1",
        provider: "google",
        generation: "g1",
      });
      await store.applySyncPage({
        ownerId: "owner",
        page: {
          session: { accountId: "acc-1", generation: "g1" },
          requestId: "bootstrap",
          from: { streamId: "primary", generation: "g1", checkpoint: null },
          to: { streamId: "primary", generation: "g1", checkpoint: "1" },
          changes: [
            messagePatch("m-arch-unread", "c-mixed", 3000, [], false),
            messagePatch("m-inbox-read", "c-mixed", 2000, ["inbox"], true),
            messagePatch("m-arch-only", "c-arch", 1000, [], false),
          ],
          requiredHydration: [],
          roundComplete: true,
        },
      });
      const archive = await store.readMailboxView({
        accountIds: ["acc-1"],
        predicate: mailboxPredicate("archive"),
        order: "newest_first",
        pageSize: 25,
        after: null,
      });
      expect(
        archive.view.conversations.map((item) => item.key.conversationId),
      ).toEqual(["c-arch"]);
      expect(archive.view.counts.unreadConversations).toBe(1);
    } finally {
      await store.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("counts a snoozed conversation unread only when the unread message is snoozed", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-snoozed-unread-"));
    const store = await createSqliteMailStore(
      createNodeSqliteDriver(join(directory, "mailbox.sqlite")),
    );
    const untilMs = Date.now() + 60 * 60 * 1000;
    try {
      await store.ensureAccount({
        accountId: "acc-1",
        provider: "google",
        generation: "g1",
      });
      await store.applySyncPage({
        ownerId: "owner",
        page: {
          session: { accountId: "acc-1", generation: "g1" },
          requestId: "bootstrap",
          from: { streamId: "primary", generation: "g1", checkpoint: null },
          to: { streamId: "primary", generation: "g1", checkpoint: "1" },
          changes: [
            messagePatch(
              "m-snoozed-read",
              "c-mixed",
              3000,
              ["inbox"],
              true,
              untilMs,
            ),
            messagePatch("m-unread", "c-mixed", 2000, ["inbox"], false),
            messagePatch(
              "m-snoozed-unread",
              "c-snoozed",
              1000,
              ["inbox"],
              false,
              untilMs,
            ),
          ],
          requiredHydration: [],
          roundComplete: true,
        },
      });
      const snoozed = await store.readMailboxView({
        accountIds: ["acc-1"],
        predicate: mailboxPredicate("snoozed"),
        order: "newest_first",
        pageSize: 25,
        after: null,
      });
      expect(
        snoozed.view.conversations.map((item) => item.key.conversationId),
      ).toEqual(["c-mixed", "c-snoozed"]);
      expect(snoozed.view.counts.unreadConversations).toBe(1);
    } finally {
      await store.close();
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("removes deleted mail from conversation and mailbox views across paginated sync delta pages", async () => {
    const store = await createSqliteMailStore(
      createNodeSqliteDriver(":memory:"),
    );
    try {
      await store.ensureAccount({
        accountId: "acc-1",
        provider: "google",
        generation: "g1",
      });
      // Initial sync with two conversations:
      // c-1 has two messages (m-1, m-2); c-2 has one message (m-3)
      await store.applySyncPage({
        ownerId: "owner",
        page: {
          session: { accountId: "acc-1", generation: "g1" },
          requestId: "init",
          from: { streamId: "primary", generation: "g1", checkpoint: null },
          to: { streamId: "primary", generation: "g1", checkpoint: "cp-1" },
          changes: [
            messagePatch("m-1", "c-1", 1000, ["inbox"]),
            messagePatch("m-2", "c-1", 2000, ["inbox"]),
            messagePatch("m-3", "c-2", 3000, ["inbox"]),
          ],
          requiredHydration: [],
          roundComplete: true,
        },
      });

      // Both conversations appear in inbox view
      const initialInbox = await store.readMailboxView({
        accountIds: ["acc-1"],
        predicate: mailboxPredicate("inbox"),
        order: "newest_first",
        pageSize: 25,
        after: null,
      });
      expect(
        initialInbox.view.conversations.map((item) => item.key.conversationId),
      ).toEqual(["c-2", "c-1"]);

      // Conversation c-1 contains both messages
      const initialConv = await store.readConversation(
        { accountId: "acc-1", conversationId: "c-1" },
        { limit: 10 },
      );
      expect(initialConv.messages.map((m) => m.messageId)).toEqual([
        "m-1",
        "m-2",
      ]);

      // Apply first delta page: delete m-2 (one message in c-1), roundComplete: false
      await store.applySyncPage({
        ownerId: "owner",
        page: {
          session: { accountId: "acc-1", generation: "g1" },
          requestId: "delta-chunk-1",
          from: { streamId: "primary", generation: "g1", checkpoint: "cp-1" },
          to: { streamId: "primary", generation: "g1", checkpoint: "cp-2" },
          changes: [
            {
              kind: "message_deleted",
              key: { accountId: "acc-1", messageId: "m-2" },
              evidence: "delta-chunk-1",
            },
          ],
          requiredHydration: [],
          roundComplete: false,
        },
      });

      // m-2 disappears from conversation c-1 view; m-1 remains
      const convAfterFirstDelete = await store.readConversation(
        { accountId: "acc-1", conversationId: "c-1" },
        { limit: 10 },
      );
      expect(convAfterFirstDelete.messages.map((m) => m.messageId)).toEqual([
        "m-1",
      ]);

      // c-1 is still in inbox view because m-1 remains
      const inboxAfterFirstDelete = await store.readMailboxView({
        accountIds: ["acc-1"],
        predicate: mailboxPredicate("inbox"),
        order: "newest_first",
        pageSize: 25,
        after: null,
      });
      expect(
        inboxAfterFirstDelete.view.conversations.map(
          (item) => item.key.conversationId,
        ),
      ).toEqual(["c-2", "c-1"]);

      // Apply second delta page: delete m-1 (last message of c-1), roundComplete: true
      await store.applySyncPage({
        ownerId: "owner",
        page: {
          session: { accountId: "acc-1", generation: "g1" },
          requestId: "delta-chunk-2",
          from: { streamId: "primary", generation: "g1", checkpoint: "cp-2" },
          to: { streamId: "primary", generation: "g1", checkpoint: "cp-3" },
          changes: [
            {
              kind: "message_deleted",
              key: { accountId: "acc-1", messageId: "m-1" },
              evidence: "delta-chunk-2",
            },
          ],
          requiredHydration: [],
          roundComplete: true,
        },
      });

      // c-1 completely disappears from inbox view and allMail view
      const finalInbox = await store.readMailboxView({
        accountIds: ["acc-1"],
        predicate: mailboxPredicate("inbox"),
        order: "newest_first",
        pageSize: 25,
        after: null,
      });
      expect(
        finalInbox.view.conversations.map((item) => item.key.conversationId),
      ).toEqual(["c-2"]);

      const finalAllMail = await store.readMailboxView({
        accountIds: ["acc-1"],
        predicate: mailboxPredicate("all"),
        order: "newest_first",
        pageSize: 25,
        after: null,
      });
      expect(
        finalAllMail.view.conversations.map((item) => item.key.conversationId),
      ).toEqual(["c-2"]);

      // Conversation c-1 is now empty
      const finalConv = await store.readConversation(
        { accountId: "acc-1", conversationId: "c-1" },
        { limit: 10 },
      );
      expect(finalConv.messages).toEqual([]);
    } finally {
      await store.close();
    }
  });
});

describe("sqlite driver contract portability", () => {
  it("does not import node:sqlite from the reusable harness", async () => {
    const source = await readFile(
      join(fileDirectory, "../test-support/driver-contract.ts"),
      "utf8",
    );
    expect(source).not.toMatch(/node:sqlite|node-sqlite/);
  });
});

function messagePatch(
  messageId: string,
  conversationId: string,
  receivedAtMs: number,
  roles: Array<"inbox" | "sent" | "draft" | "trash" | "spam">,
  read = false,
  snoozedUntilMs: number | null = null,
): Extract<ProviderChange, { kind: "message_patch" }> {
  return {
    kind: "message_patch",
    key: { accountId: "acc-1", messageId },
    reference: {
      provider: "google",
      messageId,
      conversationId,
      version: "1",
    },
    fields: {
      subject: conversationId,
      preview: messageId,
      from: "ada@example.com",
      to: ["me@example.com"],
      cc: [],
      receivedAtMs,
      read,
      starred: false,
      folderId: roles.includes("inbox") ? "inbox" : "archive",
      inboxSection: null,
      labelIds: roles.includes("inbox") ? ["INBOX"] : [],
      categoryIds: [],
      roles,
      hasAttachments: false,
      snoozedUntilMs,
    },
  };
}
