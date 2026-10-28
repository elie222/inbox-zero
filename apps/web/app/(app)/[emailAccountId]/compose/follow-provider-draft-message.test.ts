import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MailClient } from "@inboxzero/mail-core/engine";
import {
  clearLocalReplyDrafts,
  createReplyDraftWriter,
  getReplyDraft,
  type ReplyDraftContent,
} from "@/utils/mail-engine/reply-drafts";
import { followProviderDraftMessage } from "./follow-provider-draft-message";

const identity = {
  emailAccountId: "account",
  threadId: "compose-session",
  messageId: "compose-session",
};
const content: ReplyDraftContent = {
  values: { to: "someone@example.com", subject: "Hello" },
  draft: {
    editableHtml: "<p>Hello</p>",
    mode: "original",
    quotedHtml: "",
    signatureHtml: "",
  },
  preservedBlocks: [],
  attachments: [],
  requestId: "compose-1",
};

describe("followProviderDraftMessage", () => {
  beforeEach(() => {
    clearLocalReplyDrafts();
  });

  it("records a reply's mailbox copy before syncing it into the thread", async () => {
    await createReplyDraftWriter(identity).save(content);
    const client = {
      ensureMessageContent: vi.fn(async () => {
        expect(
          (await getReplyDraft(identity))?.content?.providerDraftMessageIds,
        ).toEqual(["reply-copy"]);
      }),
      requestSync: vi.fn(async () => ({})),
    } as unknown as MailClient;
    await followProviderDraftMessage({
      client,
      emailAccountId: "account",
      messageId: "reply-copy",
      localDraft: { identity, requestId: "compose-1" },
    });
    expect(client.ensureMessageContent).toHaveBeenCalledOnce();
    expect(client.requestSync).toHaveBeenCalledWith(["account"]);
  });

  // A scheduled new message records these ids so its mailbox draft stays
  // hidden until the send goes out.
  it("keeps every message a new message's mailbox draft was saved as", async () => {
    await createReplyDraftWriter(identity).save(content);
    const client = {
      ensureMessageContent: vi.fn(async () => ({})),
      requestSync: vi.fn(async () => ({})),
    } as unknown as MailClient;

    for (const messageId of ["draft-message-1", "draft-message-2"]) {
      await followProviderDraftMessage({
        client,
        emailAccountId: "account",
        messageId,
        localDraft: { identity, requestId: "compose-1" },
      });
    }

    expect(
      (await getReplyDraft(identity))?.content?.providerDraftMessageIds,
    ).toEqual(["draft-message-1", "draft-message-2"]);
    expect(client.ensureMessageContent).toHaveBeenCalledWith({
      accountId: "account",
      messageId: "draft-message-2",
    });
  });
});
