import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  createHostRuntime,
  createMailEngine,
} from "@inboxzero/mail-core/engine";
import { createMemoryBlobStore } from "@inboxzero/mail-core/memory-blob-store";
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

  it("keeps referenced local attachments across eviction", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-client-blobs-"));
    const store = await createSqliteMailStore(
      createNodeSqliteDriver(join(directory, "mailbox.sqlite")),
    );
    try {
      await store.ensureAccount({
        accountId: "acc-1",
        provider: "google",
        generation: "g1",
      });
      await store.stageDraftAttachment({
        accountId: "acc-1",
        draftId: "d1",
        attachmentId: "att1",
        filename: "a.txt",
        contentType: "text/plain",
        checksum: "abc",
        sizeBytes: 4,
      });
      await store.saveDraft({
        key: { accountId: "acc-1", draftId: "d1" },
        expectedRevision: null,
        content: {
          to: ["ada@example.com"],
          cc: [],
          bcc: [],
          subject: "File",
          editableHtml: "<p>File</p>",
          quotedHtml: "",
          attachmentIds: ["att1"],
        },
      });
      expect(await store.listReferencedBlobIds()).toContain("att1");
      await store.evictReplaceableContent();
      expect(await store.listReferencedBlobIds()).toContain("att1");
      await store.purgeAccount("acc-1");
      expect(await store.listReferencedBlobIds()).not.toContain("att1");
    } finally {
      await store.close();
      await rm(directory, { recursive: true, force: true });
    }
  });
});

describe("offline attachment send", () => {
  it("uploads before send and retries the same identities after interruption", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-attach-send-"));
    const path = join(directory, "mailbox.sqlite");
    const blobStore = createMemoryBlobStore();
    const uploads: string[] = [];
    const store = await createSqliteMailStore(createNodeSqliteDriver(path));
    const engine = createMailEngine({
      store,
      source: {
        async describe() {
          return {
            status: "ok",
            value: {
              strategy: "account_history",
              supportedChanges: ["archive"],
              maxPageSize: 50,
              maxHydrationBatch: 20,
            },
          };
        },
        async discoverScopes() {
          return { status: "ok", value: { scopes: [], nextPage: null } };
        },
        async beginBootstrap() {
          return {
            status: "paused",
            retryAfterMs: 60_000,
            reason: "unavailable",
          };
        },
        async enumerate() {
          return {
            status: "paused",
            retryAfterMs: 60_000,
            reason: "unavailable",
          };
        },
        async readChanges() {
          return {
            status: "paused",
            retryAfterMs: 60_000,
            reason: "unavailable",
          };
        },
        async hydrate() {
          return {
            status: "paused",
            retryAfterMs: 60_000,
            reason: "unavailable",
          };
        },
        async readConversationMembership() {
          return {
            status: "paused",
            retryAfterMs: 60_000,
            reason: "unavailable",
          };
        },
        async search() {
          return { status: "unsupported" };
        },
        async readAttachment() {
          return {
            status: "paused",
            retryAfterMs: 60_000,
            reason: "unavailable",
          };
        },
      },
      executor: {
        async execute() {
          return {
            status: "confirmed",
            receiptId: "rcpt",
            observations: [],
            targets: [],
          };
        },
        async inspect() {
          return { status: "uncertain", receiptId: "rcpt" };
        },
        async stageUpload({ uploadId }) {
          uploads.push(uploadId);
          return { status: "staged", blobId: uploadId };
        },
      },
      runtime: createHostRuntime(),
      blobStore,
      ownerId: "test-owner",
    });
    try {
      await store.ensureAccount({
        accountId: "acc-1",
        provider: "google",
        generation: "g1",
      });
      const staged = await engine.stageDraftAttachment({
        accountId: "acc-1",
        draftId: "d1",
        attachmentId: "att-send-1",
        filename: "note.txt",
        contentType: "text/plain",
        checksum: "unused",
        sizeBytes: 4,
        bytes: (async function* () {
          yield new Uint8Array([1, 2, 3, 4]);
        })(),
      });
      expect(staged.status).toBe("staged");
      const saved = await engine.saveDraft({
        key: { accountId: "acc-1", draftId: "d1" },
        expectedRevision: null,
        content: {
          to: ["ada@example.com"],
          cc: [],
          bcc: [],
          subject: "Note",
          editableHtml: "<p>Note</p>",
          quotedHtml: "",
          attachmentIds: ["att-send-1"],
        },
      });
      expect(saved.status).toBe("saved");
      if (saved.status !== "saved") throw new Error("expected save");
      const admitted = await engine.submitSend({
        commandId: "send-att",
        draft: { accountId: "acc-1", draftId: "d1" },
        draftRevision: saved.draftRevision,
        replyTo: null,
      });
      expect(admitted.status).toBe("queued");
      const interrupted = await store.claimWork({
        ownerId: "test-owner",
        nowMs: Date.now(),
        leaseMs: 1,
      });
      expect(interrupted?.kind).toBe("upload");
      if (interrupted?.kind !== "upload") throw new Error("expected upload");
      expect(interrupted.attachmentId).toBe("att-send-1");
      await engine.close();

      const reopened = await createSqliteMailStore(
        createNodeSqliteDriver(path),
      );
      const recovered = await reopened.claimWork({
        ownerId: "test-owner",
        nowMs: Date.now() + 10,
        leaseMs: 30_000,
      });
      expect(recovered?.kind).toBe("upload");
      if (recovered?.kind !== "upload") throw new Error("expected upload");
      expect(recovered.attachmentId).toBe("att-send-1");
      expect(recovered.operation.key.operationId).toBe("send-att");
      await reopened.close();
    } finally {
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
    },
  };
}
