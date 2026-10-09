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
