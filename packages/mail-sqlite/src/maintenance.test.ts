import { describe, expect, it } from "vitest";
import {
  evictReplaceableMessageContent,
  listReferencedBlobIds,
} from "./maintenance";
import { createNodeSqliteDriver } from "./node-sqlite";
import { createSqliteMailStore } from "./store";
import type { ProviderChange } from "@inboxzero/mail-core/sync";

describe("replaceable body retention", () => {
  it("deletes hydrated bodies without dropping drafts, queued ops, or metadata", async () => {
    const driver = createNodeSqliteDriver();
    const store = await createSqliteMailStore(driver);
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    await store.applySyncPage({
      ownerId: "owner",
      page: {
        session: { accountId: "acc-1", generation: "g1" },
        requestId: "boot",
        from: { streamId: "primary", generation: "g1", checkpoint: null },
        to: { streamId: "primary", generation: "g1", checkpoint: "1" },
        changes: [messagePatch("m1", "c1", 1000, ["inbox"])],
        requiredHydration: [],
        roundComplete: true,
      },
    });
    const hydrated = await store.applyHydration({
      session: { accountId: "acc-1", generation: "g1" },
      requestId: "body",
      changes: [],
      bodies: [
        {
          key: { accountId: "acc-1", messageId: "m1" },
          version: "1",
          html: "<p>replaceable</p>",
          text: "replaceable",
        },
      ],
    });
    expect(hydrated.status).toBe("committed");
    const saved = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d1" },
      expectedRevision: null,
      content: {
        to: ["ada@example.com"],
        cc: [],
        bcc: [],
        subject: "Keep me",
        editableHtml: "<p>Keep me</p>",
        quotedHtml: "",
        attachmentIds: [],
      },
    });
    expect(saved.status).toBe("saved");
    const before = await store.readConversation(
      { accountId: "acc-1", conversationId: "c1" },
      { after: null, pageSize: 10 },
    );
    expect(before.view.messages[0]?.content).toEqual({
      status: "available",
      html: "<p>replaceable</p>",
      text: "replaceable",
      attachments: [],
      isMeetingInvitation: false,
    });

    const result = await evictReplaceableMessageContent(driver);
    expect(result.evictedBodies).toBe(1);

    const after = await store.readConversation(
      { accountId: "acc-1", conversationId: "c1" },
      { after: null, pageSize: 10 },
    );
    expect(after.view.messages[0]?.content).toEqual({
      status: "not_requested",
    });
    expect(after.view.messages[0]?.metadata.subject).toBe("c1");
    const inbox = await store.readMailboxView({
      accountIds: ["acc-1"],
      predicate: { kind: "role", role: "inbox" },
      order: "newest_first",
      pageSize: 25,
      after: null,
    });
    expect(inbox.view.counts.matchingConversations).toBe(1);
    expect(
      await store.readDraft({ accountId: "acc-1", draftId: "d1" }),
    ).toMatchObject({
      status: "found",
      content: { subject: "Keep me" },
    });
    const queued = await store.admitMetadata({
      accountId: "acc-1",
      commandId: "archive-1",
      targets: [{ accountId: "acc-1", messageId: "m1" }],
      change: { kind: "archive" },
    });
    expect(queued.status).toBe("queued");
    const operation = await store.readOperation({
      accountId: "acc-1",
      operationId: "archive-1",
    });
    expect(operation.operation?.status).toBe("queued");
    expect(
      (
        await store.readMailboxView({
          accountIds: ["acc-1"],
          predicate: { kind: "role", role: "inbox" },
          order: "newest_first",
          pageSize: 25,
          after: null,
        })
      ).view.counts.matchingConversations,
    ).toBe(0);
    await store.close();
  });

  it("does not bump revision when there are no bodies to evict", async () => {
    const driver = createNodeSqliteDriver();
    const store = await createSqliteMailStore(driver);
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    const before = await store.inspect();
    expect(await evictReplaceableMessageContent(driver)).toEqual({
      evictedBodies: 0,
    });
    expect(await store.inspect()).toMatchObject({
      revision: before.revision,
    });
    await store.close();
  });
});

function messagePatch(
  messageId: string,
  conversationId: string,
  receivedAtMs: number,
  roles: Array<"inbox" | "sent" | "draft" | "trash" | "spam">,
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
      read: false,
      starred: false,
      folderId: roles.includes("inbox") ? "inbox" : "archive",
      labelIds: roles.includes("inbox") ? ["INBOX"] : [],
      categoryIds: [],
      roles,
      hasAttachments: false,
    },
  };
}

describe("referenced blob ids", () => {
  it("lists blobs held by drafts and pending sends", async () => {
    const driver = createNodeSqliteDriver();
    const store = await createSqliteMailStore(driver);
    await store.ensureAccount({
      accountId: "acc-1",
      provider: "google",
      generation: "g1",
    });
    expect(
      (
        await store.saveDraft({
          key: { accountId: "acc-1", draftId: "d-keep" },
          expectedRevision: null,
          content: {
            to: ["ada@example.com"],
            cc: [],
            bcc: [],
            subject: "Keep",
            editableHtml: "<p>Keep</p>",
            quotedHtml: "",
            attachmentIds: ["keep-draft"],
          },
        })
      ).status,
    ).toBe("saved");
    const sending = await store.saveDraft({
      key: { accountId: "acc-1", draftId: "d-send" },
      expectedRevision: null,
      content: {
        to: ["ada@example.com"],
        cc: [],
        bcc: [],
        subject: "Send",
        editableHtml: "<p>Send</p>",
        quotedHtml: "",
        attachmentIds: ["keep-send"],
      },
    });
    expect(sending.status).toBe("saved");
    if (sending.status !== "saved") throw new Error("expected save");
    expect(
      (
        await store.admitSend({
          commandId: "send-keep",
          draft: { accountId: "acc-1", draftId: "d-send" },
          draftRevision: sending.draftRevision,
          replyTo: null,
        })
      ).status,
    ).toBe("queued");
    expect((await listReferencedBlobIds(driver)).sort()).toEqual([
      "keep-draft",
      "keep-send",
    ]);
    await store.close();
  });
});
