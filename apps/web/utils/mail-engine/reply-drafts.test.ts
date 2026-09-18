import { beforeEach, describe, expect, it } from "vitest";
import {
  clearLocalReplyDrafts,
  createReplyDraftWriter,
  getReplyDraft,
  getReplyDraftForSession,
  getReplyDrafts,
  getReplyDraftSessionId,
  updateReplyDraftProviderState,
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
  attachments: [],
};

describe("local reply drafts", () => {
  beforeEach(() => clearLocalReplyDrafts());

  it("keeps the provider reference when a reopened writer saves newer content", async () => {
    const original = { ...content, requestId: "compose-1" };
    await createReplyDraftWriter(identity).save(original);
    const reopened = createReplyDraftWriter(identity, 1);
    expect(
      await updateReplyDraftProviderState(identity, "compose-1"),
    ).toBeUndefined();
    await updateReplyDraftProviderState(identity, "compose-1", "provider-1");
    await reopened.save({
      ...original,
      values: { ...original.values, subject: "New edit" },
    });
    expect((await getReplyDraft(identity))?.content).toMatchObject({
      providerDraftId: "provider-1",
      providerDraftCreationUnconfirmed: false,
      values: { subject: "New edit" },
    });
  });

  it("does not repeat an uncertain creation or revive a discarded compose", async () => {
    const writer = createReplyDraftWriter(identity);
    await writer.save({ ...content, requestId: "compose-1" });
    await updateReplyDraftProviderState(identity, "compose-1");
    await expect(
      updateReplyDraftProviderState(identity, "compose-1"),
    ).rejects.toThrow(/could not be confirmed/);
    await writer.clear();
    await expect(
      updateReplyDraftProviderState(identity, "compose-1"),
    ).rejects.toThrow("This draft changed. Reopen the composer.");
    expect((await getReplyDraft(identity))?.content).toBeNull();
  });

  it("migrates a legacy identity onto the session key", async () => {
    await createReplyDraftWriter(identity).save({
      ...content,
      values: {
        ...content.values,
        replyToEmail: {
          threadId: "thread",
          headerMessageId: "<id>",
          messageId: "parent",
        },
      },
    });
    const migrated = await getReplyDraftForSession(
      replyIdentity,
      identity,
      "reply",
    );
    expect(migrated?.messageId).toBe(replyIdentity.messageId);
    expect((await getReplyDraft(identity))?.content).toBeNull();
    expect(await getReplyDrafts("account", "thread")).toHaveLength(1);
  });

  it("clears drafts for one account without touching another", async () => {
    await createReplyDraftWriter(identity).save(content);
    await createReplyDraftWriter({
      ...identity,
      emailAccountId: "other",
    }).save(content);
    clearLocalReplyDrafts("account");
    expect(await getReplyDraft(identity)).toBeUndefined();
    expect(
      await getReplyDraft({ ...identity, emailAccountId: "other" }),
    ).toMatchObject({ emailAccountId: "other" });
  });

  it("restores a compose draft from the engine after memory is cleared", async () => {
    const { setActiveMailClient } = await import("./active-client");
    const drafts = new Map<
      string,
      { revision: number; content: Record<string, unknown> }
    >();
    setActiveMailClient({
      async saveDraft(input) {
        const next = (drafts.get(input.key.draftId)?.revision ?? 0) + 1;
        drafts.set(input.key.draftId, {
          revision: next,
          content: input.content,
        });
        return {
          status: "saved" as const,
          draftRevision: next,
          revision: { databaseEpoch: "e", sequence: next },
        };
      },
      async readDraft(key) {
        const stored = drafts.get(key.draftId);
        if (!stored) return { status: "missing" as const };
        return {
          status: "found" as const,
          draftRevision: stored.revision,
          content: stored.content as never,
        };
      },
    } as never);
    await createReplyDraftWriter({
      ...identity,
      messageId: "compose:new-message",
    }).save({
      ...content,
      values: { ...content.values, subject: "Mailbox draft example" },
    });
    clearLocalReplyDrafts();
    expect(
      (
        await getReplyDraft({
          ...identity,
          messageId: "compose:new-message",
        })
      )?.content?.values.subject,
    ).toBe("Mailbox draft example");
    setActiveMailClient(null);
  });
});
