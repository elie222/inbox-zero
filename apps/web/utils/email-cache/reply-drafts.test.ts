// @vitest-environment jsdom
import {
  enqueueMailMutation,
  getMailMutation,
  claimNextMailMutation,
} from "./mail-mutations";
import "fake-indexeddb/auto";
import { validateEmailAttachments } from "@inboxzero/email-editor/core";
import { beforeEach, describe, expect, it } from "vitest";
import { clearEmailCache, clearEmailCacheForAccount } from "./database";
import {
  restoreReplyFromOutbox,
  createReplyDraftWriter,
  getReplyDraft,
  getReplyDraftForSession,
  getReplyDrafts,
  getReplyDraftSessionId,
  type ReplyDraftContent,
} from "./reply-drafts";

const identity = {
  emailAccountId: "account",
  threadId: "thread",
  messageId: "parent",
};
const replyIdentity = {
  ...identity,
  messageId: getReplyDraftSessionId(identity.messageId, "reply"),
};
const content: ReplyDraftContent = {
  values: {
    to: "someone@example.com",
    subject: "Reply",
    cc: "other@example.com",
  },
  draft: {
    editableHtml: "<p>My reply</p>",
    mode: "rich",
    quotedHtml: "",
    signatureHtml: "",
    unsupported: [],
  },
  preservedBlocks: [
    { id: "quote", kind: "quote", html: "<p>Original</p>", collapsed: true },
  ],
  attachments: [
    {
      id: "file",
      filename: "notes.txt",
      mimeType: "text/plain",
      contentBase64: "aGk=",
      size: 2,
      disposition: "attachment",
    },
  ],
};

describe("local reply drafts", () => {
  beforeEach(clearEmailCache);
  it("restores body, recipients, quote and attachments after the writer is replaced", async () => {
    await createReplyDraftWriter(identity).save(content);
    const saved = await getReplyDraft(identity);
    expect(saved?.content).toEqual(content);
    const replacement = createReplyDraftWriter(identity, saved?.revision);
    await replacement.save({
      ...content,
      values: { ...content.values, bcc: "private@example.com" },
    });
    expect((await getReplyDraft(identity))?.content?.values.bcc).toBe(
      "private@example.com",
    );
  });
  it("keeps reply and forward sessions isolated for the same message", async () => {
    const forwardIdentity = {
      ...identity,
      messageId: getReplyDraftSessionId(identity.messageId, "forward"),
    };
    await createReplyDraftWriter(replyIdentity).save(content);
    await createReplyDraftWriter(forwardIdentity).save({
      ...content,
      values: { ...content.values, to: "" },
      draft: { ...content.draft, editableHtml: "<p>Forward text</p>" },
    });

    expect(
      (await getReplyDraft(replyIdentity))?.content?.draft.editableHtml,
    ).toBe("<p>My reply</p>");
    expect(
      (await getReplyDraft(forwardIdentity))?.content?.draft.editableHtml,
    ).toBe("<p>Forward text</p>");
  });
  it("migrates a legacy forward draft across concurrent readers", async () => {
    const forwardIdentity = {
      ...identity,
      messageId: getReplyDraftSessionId(identity.messageId, "forward"),
    };
    await createReplyDraftWriter(identity).save(content);

    const [migrated, concurrentMigration] = await Promise.all([
      getReplyDraftForSession(forwardIdentity, identity, "forward"),
      getReplyDraftForSession(forwardIdentity, identity, "forward"),
    ]);

    expect(migrated?.content).toMatchObject({ composeMode: "forward" });
    expect(concurrentMigration?.content).toMatchObject({
      composeMode: "forward",
    });
    expect(migrated?.content?.draft.editableHtml).toBe("<p>My reply</p>");
    expect((await getReplyDraft(identity))?.content).toBeNull();
  });
  it("migrates a legacy reply draft to its separate session", async () => {
    await createReplyDraftWriter(identity).save({
      ...content,
      values: {
        ...content.values,
        replyToEmail: {
          threadId: identity.threadId,
          headerMessageId: "header-message-id",
        },
      },
    });

    const migrated = await getReplyDraftForSession(
      replyIdentity,
      identity,
      "reply",
    );

    expect(migrated?.content).toMatchObject({ composeMode: "reply" });
    expect(migrated?.content?.draft.editableHtml).toBe("<p>My reply</p>");
    expect(migrated?.content?.values).toMatchObject({
      to: "someone@example.com",
      replyToEmail: {
        threadId: identity.threadId,
        headerMessageId: "header-message-id",
      },
    });
    expect((await getReplyDraft(identity))?.content).toBeNull();
  });
  it("does not hydrate drafts from reads overlapping account cleanup", async () => {
    await createReplyDraftWriter(identity).save(content);
    const read = getReplyDraft(identity);
    const list = getReplyDrafts(identity.emailAccountId, identity.threadId);
    const assertions = Promise.all([
      expect(read).rejects.toThrow("cleared"),
      expect(list).rejects.toThrow("cleared"),
    ]);
    await clearEmailCacheForAccount(identity.emailAccountId);
    await assertions;
  });

  it("does not migrate a legacy draft while account cleanup is running", async () => {
    await createReplyDraftWriter(identity).save(content);
    const migration = getReplyDraftForSession(replyIdentity, identity, "reply");
    const assertion = expect(migration).rejects.toThrow("cleared");
    await clearEmailCacheForAccount(identity.emailAccountId);
    await assertion;
    expect(
      await getReplyDrafts(identity.emailAccountId, identity.threadId),
    ).toEqual([]);
  });

  it("does not recreate an outbox draft when recovery overlaps account cleanup", async () => {
    const queued = await enqueueMailMutation({
      ...identity,
      messageIds: [identity.messageId],
      kind: "reply",
      email: {
        replyToEmail: {
          threadId: identity.threadId,
          headerMessageId: "header-message-id",
        },
        to: "person@example.com",
        subject: "Reply",
        messageHtml: "<p>Private draft</p>",
      },
    });
    const restoring = restoreReplyFromOutbox(
      queued.id,
      identity.emailAccountId,
    );
    const assertion = expect(restoring).rejects.toThrow("cleared");
    await clearEmailCacheForAccount(identity.emailAccountId);
    await assertion;
    expect(
      await getReplyDrafts(identity.emailAccountId, identity.threadId),
    ).toEqual([]);
  });

  it("serializes pending saves before clearing and rejects stale tabs", async () => {
    const writer = createReplyDraftWriter(identity);
    const stale = createReplyDraftWriter(identity);
    const pending = writer.save(content);
    const clearing = writer.clear();
    await Promise.all([pending, clearing]);
    await expect(writer.save(content)).rejects.toThrow("closed");
    await expect(stale.save(content)).rejects.toThrow("another tab");
    expect(await getReplyDrafts("account", "thread")).toEqual([]);
  });
  it("does not leave a writer closed when clearing fails", async () => {
    const stale = createReplyDraftWriter(identity);
    await createReplyDraftWriter(identity).save(content);

    await expect(stale.clear()).rejects.toThrow("another tab");
    await expect(stale.save(content)).rejects.toThrow("another tab");
  });
  it("restores a queued reply for editing atomically without losing its body", async () => {
    const queued = await enqueueMailMutation({
      ...identity,
      messageIds: [identity.messageId],
      kind: "reply",
      email: {
        replyToEmail: {
          threadId: identity.threadId,
          headerMessageId: "header-message-id",
        },
        to: "person@example.com",
        subject: "Reply",
        messageHtml: "<p>Keep this text</p>",
        attachments: [
          { filename: "note.txt", contentType: "text/plain", content: "aGk=" },
        ],
      },
    });
    await restoreReplyFromOutbox(queued.id, identity.emailAccountId);
    expect(await getMailMutation(queued.id)).toBeUndefined();
    expect(
      (await getReplyDraft(replyIdentity))?.content?.draft.editableHtml,
    ).toContain("Keep this text");
    const attachments =
      (await getReplyDraft(replyIdentity))?.content?.attachments ?? [];
    expect(attachments).toHaveLength(1);
    expect(validateEmailAttachments(attachments).valid).toBe(true);
  });
  it("restores a queued forward into its forward session", async () => {
    const queued = await enqueueMailMutation({
      ...identity,
      messageIds: [identity.messageId],
      kind: "reply",
      email: {
        to: "person@example.com",
        subject: "Fwd: Reply",
        messageHtml: "<p>Forward this text</p>",
      },
    });

    const restored = await restoreReplyFromOutbox(
      queued.id,
      identity.emailAccountId,
    );

    expect(restored).toEqual({
      messageId: identity.messageId,
      mode: "forward",
    });
    expect(
      (
        await getReplyDraft({
          ...identity,
          messageId: getReplyDraftSessionId(identity.messageId, "forward"),
        })
      )?.content,
    ).toMatchObject({ composeMode: "forward" });
  });
  it("does not restore a reply already claimed for sending", async () => {
    const queued = await enqueueMailMutation({
      ...identity,
      messageIds: [identity.messageId],
      kind: "reply",
      email: {
        to: "person@example.com",
        subject: "Reply",
        messageHtml: "<p>In flight</p>",
      },
    });
    await claimNextMailMutation({ ownerId: "worker", leaseMs: 30_000 });
    await expect(
      restoreReplyFromOutbox(queued.id, identity.emailAccountId),
    ).rejects.toThrow("already started");
    expect((await getMailMutation(queued.id))?.status).toBe("processing");
    expect(await getReplyDraft(identity)).toBeUndefined();
  });

  it("isolates accounts and prevents writes after account cleanup", async () => {
    const writer = createReplyDraftWriter(identity);
    await writer.save(content);
    await createReplyDraftWriter({ ...identity, emailAccountId: "other" }).save(
      content,
    );
    await clearEmailCacheForAccount("account");
    await expect(writer.save(content)).rejects.toThrow("cleared");
    expect(await getReplyDraft(identity)).toBeUndefined();
    expect(await getReplyDrafts("other", "thread")).toHaveLength(1);
  });
});
