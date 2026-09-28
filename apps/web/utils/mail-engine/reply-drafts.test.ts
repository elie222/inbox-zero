import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearLocalReplyDrafts,
  createReplyDraftWriter,
  getReplyDraft,
  getReplyDraftForSession,
  getReplyDrafts,
  getReplyDraftSessionId,
  restoreUnsentReplyDraft,
  updateReplyDraftProviderState,
  type ReplyDraftContent,
} from "./reply-drafts";

const releaseHolds = vi.hoisted(() => vi.fn());

vi.mock("@/utils/mail-engine/stage-attachments", () => ({
  releaseSendAttachmentHolds: releaseHolds,
}));

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
  beforeEach(() => {
    clearLocalReplyDrafts();
    releaseHolds.mockReset();
    releaseHolds.mockResolvedValue(undefined);
  });

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

  it("persists the provider draft id so reload can discard or send it", async () => {
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
    await createReplyDraftWriter(identity).save({
      ...content,
      requestId: "compose-1",
    });
    await updateReplyDraftProviderState(identity, "compose-1", "provider-1");
    expect(drafts.get("parent")?.content.providerDraftId).toBe("provider-1");
    expect(
      JSON.parse(String(drafts.get("parent")?.content.clientState))
        .providerDraftId,
    ).toBe("provider-1");
    setActiveMailClient(null);
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

  it("saves edits after the first save without a revision conflict", async () => {
    const { setActiveMailClient } = await import("./active-client");
    const client = createRevisionCheckingClient();
    setActiveMailClient(client as never);
    const writer = createReplyDraftWriter(identity);

    await writer.save(content);
    await writer.save({
      ...content,
      draft: { ...content.draft, editableHtml: "<p>My reply, edited</p>" },
    });

    expect(client.conflicts).toBe(0);
    expect(client.saveDraft).toHaveBeenCalledTimes(2);
    expect(
      (await client.readDraft({ accountId: "account", draftId: "parent" }))
        .content?.editableHtml,
    ).toBe("<p>My reply, edited</p>");
    setActiveMailClient(null);
  });

  it("saves a draft restored from the engine without a revision conflict", async () => {
    const { setActiveMailClient } = await import("./active-client");
    const client = createRevisionCheckingClient();
    setActiveMailClient(client as never);
    await createReplyDraftWriter(identity).save(content);
    clearLocalReplyDrafts();

    const restored = await getReplyDraft(identity);
    await createReplyDraftWriter(identity, restored?.revision).save({
      ...content,
      draft: { ...content.draft, editableHtml: "<p>Continued</p>" },
    });

    expect(client.conflicts).toBe(0);
    expect(client.saveDraft).toHaveBeenCalledTimes(2);
    setActiveMailClient(null);
  });

  it("copies a cancelled send draft into the reply composer session", async () => {
    const { setActiveMailClient } = await import("./active-client");
    setActiveMailClient({
      async readDraft() {
        return {
          status: "found" as const,
          draftRevision: 1,
          content: {
            to: ["leslie@example.com"],
            cc: [],
            bcc: [],
            subject: "Re: Reply Workflow Message",
            editableHtml:
              "<p>I can review the updated proposal on Thursday.</p>",
            quotedHtml: "",
            attachmentIds: [],
          },
        };
      },
      async saveDraft() {
        return {
          status: "saved" as const,
          draftRevision: 1,
          revision: { databaseEpoch: "e", sequence: 1 },
        };
      },
    } as never);
    await createReplyDraftWriter(replyIdentity).save(content);
    await restoreUnsentReplyDraft({
      emailAccountId: "account",
      threadId: "thread",
      messageId: "parent",
      operationId: "send-1",
    });
    expect(
      (await getReplyDraft(replyIdentity))?.content?.draft.editableHtml,
    ).toBe("<p>I can review the updated proposal on Thursday.</p>");
    expect(releaseHolds).toHaveBeenCalledWith("account", []);
    setActiveMailClient(null);
  });

  it("releases staged blob holds without deleting files the composer cannot restage", async () => {
    const { setActiveMailClient } = await import("./active-client");
    setActiveMailClient({
      async readDraft() {
        return {
          status: "found" as const,
          draftRevision: 1,
          content: {
            to: ["leslie@example.com"],
            cc: [],
            bcc: [],
            subject: "Re: Reply Workflow Message",
            editableHtml:
              "<p>I can review the updated proposal on Thursday.</p>",
            quotedHtml: "",
            attachmentIds: ["blob-1"],
          },
        };
      },
      async saveDraft() {
        return {
          status: "saved" as const,
          draftRevision: 1,
          revision: { databaseEpoch: "e", sequence: 1 },
        };
      },
    } as never);
    await restoreUnsentReplyDraft({
      emailAccountId: "account",
      threadId: "thread",
      messageId: "parent",
      operationId: "send-1",
    });
    expect((await getReplyDraft(replyIdentity))?.content?.attachments).toEqual(
      [],
    );
    expect(releaseHolds).toHaveBeenCalledWith("account", ["blob-1"]);
    setActiveMailClient(null);
  });

  it("restores through an explicit mail client when the active client is missing", async () => {
    const { setActiveMailClient } = await import("./active-client");
    setActiveMailClient(null);
    const client = {
      async readDraft() {
        return {
          status: "found" as const,
          draftRevision: 1,
          content: {
            to: ["leslie@example.com"],
            cc: [],
            bcc: [],
            subject: "Re: Reply Workflow Message",
            editableHtml:
              "<p>I can review the updated proposal on Thursday.</p>",
            quotedHtml: "",
            attachmentIds: [],
          },
        };
      },
      async saveDraft() {
        return {
          status: "saved" as const,
          draftRevision: 1,
          revision: { databaseEpoch: "e", sequence: 1 },
        };
      },
    };
    await restoreUnsentReplyDraft({
      client: client as never,
      emailAccountId: "account",
      threadId: "thread",
      messageId: "parent",
      operationId: "send-1",
    });
    expect(
      (await getReplyDraft(replyIdentity))?.content?.draft.editableHtml,
    ).toBe("<p>I can review the updated proposal on Thursday.</p>");
  });

  it("throws when there is no mail client to restore from", async () => {
    const { setActiveMailClient } = await import("./active-client");
    setActiveMailClient(null);
    await expect(
      restoreUnsentReplyDraft({
        emailAccountId: "account",
        threadId: "thread",
        messageId: "parent",
        operationId: "send-1",
      }),
    ).rejects.toThrow(/still starting/);
  });

  it("throws when the queued send draft is missing", async () => {
    const { setActiveMailClient } = await import("./active-client");
    setActiveMailClient({
      async readDraft() {
        return { status: "missing" as const };
      },
    } as never);
    await expect(
      restoreUnsentReplyDraft({
        emailAccountId: "account",
        threadId: "thread",
        messageId: "parent",
        operationId: "send-1",
      }),
    ).rejects.toThrow(/no longer on this device/);
    setActiveMailClient(null);
  });

  it("still restores the composer when hold release fails", async () => {
    releaseHolds.mockRejectedValue(new Error("network down"));
    const { setActiveMailClient } = await import("./active-client");
    setActiveMailClient({
      async readDraft() {
        return {
          status: "found" as const,
          draftRevision: 1,
          content: {
            to: ["leslie@example.com"],
            cc: [],
            bcc: [],
            subject: "Re: Reply Workflow Message",
            editableHtml:
              "<p>I can review the updated proposal on Thursday.</p>",
            quotedHtml: "",
            attachmentIds: ["blob-1"],
          },
        };
      },
      async saveDraft() {
        return {
          status: "saved" as const,
          draftRevision: 1,
          revision: { databaseEpoch: "e", sequence: 1 },
        };
      },
    } as never);
    await restoreUnsentReplyDraft({
      emailAccountId: "account",
      threadId: "thread",
      messageId: "parent",
      operationId: "send-1",
    });
    expect(
      (await getReplyDraft(replyIdentity))?.content?.draft.editableHtml,
    ).toBe("<p>I can review the updated proposal on Thursday.</p>");
    setActiveMailClient(null);
  });

  it("releases blob holds even when restoring the composer fails", async () => {
    const { setActiveMailClient } = await import("./active-client");
    let releaseSessionRead = () => {};
    const sessionRead = new Promise<void>((resolve) => {
      releaseSessionRead = resolve;
    });
    let waitingForSession = false;
    setActiveMailClient({
      async readDraft(key: { draftId: string }) {
        if (key.draftId !== "send-1") {
          waitingForSession = true;
          await sessionRead;
          return { status: "missing" as const };
        }
        return {
          status: "found" as const,
          draftRevision: 1,
          content: {
            to: ["leslie@example.com"],
            cc: [],
            bcc: [],
            subject: "Re: Reply Workflow Message",
            editableHtml:
              "<p>I can review the updated proposal on Thursday.</p>",
            quotedHtml: "",
            attachmentIds: ["blob-1"],
          },
        };
      },
      async saveDraft() {
        return {
          status: "saved" as const,
          draftRevision: 1,
          revision: { databaseEpoch: "e", sequence: 1 },
        };
      },
    } as never);
    const restore = restoreUnsentReplyDraft({
      emailAccountId: "account",
      threadId: "thread",
      messageId: "parent",
      operationId: "send-1",
    });
    await vi.waitFor(() => expect(waitingForSession).toBe(true));
    await createReplyDraftWriter(replyIdentity).save(content);
    releaseSessionRead();
    await expect(restore).rejects.toThrow(/another tab/);
    expect(releaseHolds).toHaveBeenCalledWith("account", ["blob-1"]);
    setActiveMailClient(null);
  });
});

function createRevisionCheckingClient() {
  const drafts = new Map<
    string,
    { revision: number; content: Record<string, unknown> }
  >();
  const client = {
    conflicts: 0,
    saveDraft: vi.fn(
      async (input: {
        key: { draftId: string };
        expectedRevision: number | null;
        content: Record<string, unknown>;
      }) => {
        const currentRevision = drafts.get(input.key.draftId)?.revision ?? null;
        if (input.expectedRevision !== currentRevision) {
          client.conflicts += 1;
          return {
            status: "conflict" as const,
            currentDraftRevision: currentRevision,
          };
        }
        const next = (currentRevision ?? 0) + 1;
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
    ),
    async readDraft(key: { draftId: string }) {
      const stored = drafts.get(key.draftId);
      if (!stored) return { status: "missing" as const, content: undefined };
      return {
        status: "found" as const,
        draftRevision: stored.revision,
        content: stored.content,
      };
    },
  };
  return client;
}
