import { beforeEach, expect, it, vi } from "vitest";
import {
  getReplyDraft,
  type ReplyDraftContent,
} from "@/utils/mail-engine/reply-drafts";
import { resolveSendDraftId } from "./send-draft-reference";

vi.mock("@/utils/mail-engine/reply-drafts", () => ({ getReplyDraft: vi.fn() }));

const identity = {
  emailAccountId: "account",
  threadId: "thread",
  messageId: "message",
};
const content: ReplyDraftContent = {
  values: { to: "recipient@example.com", subject: "Reply" },
  draft: {
    editableHtml: "<p>Reply</p>",
    mode: "original",
    quotedHtml: "",
    signatureHtml: "",
  },
  preservedBlocks: [],
  attachments: [],
};

beforeEach(() => vi.resetAllMocks());

it("uses the known provider reference even when local draft storage is unavailable", async () => {
  vi.mocked(getReplyDraft).mockRejectedValue(
    new Error("Local draft storage was cleared"),
  );
  await expect(resolveSendDraftId("draft-1", identity)).resolves.toEqual({
    draftId: "draft-1",
  });
  expect(getReplyDraft).not.toHaveBeenCalled();
});

it("recovers the provider reference persisted by a previous composer", async () => {
  vi.mocked(getReplyDraft).mockResolvedValue({
    ...identity,
    revision: 1,
    updatedAt: 0,
    content: { ...content, providerDraftId: "draft-1" },
  });
  await expect(resolveSendDraftId(undefined, identity)).resolves.toEqual({
    draftId: "draft-1",
    replacesUnconfirmedDraft: false,
  });
});

it("sends without blocking when mailbox draft creation was not confirmed, replacing any draft it left", async () => {
  vi.mocked(getReplyDraft).mockResolvedValue({
    ...identity,
    revision: 1,
    updatedAt: 0,
    content: { ...content, providerDraftCreationUnconfirmed: true },
  });
  await expect(resolveSendDraftId(undefined, identity)).resolves.toEqual({
    draftId: undefined,
    replacesUnconfirmedDraft: true,
  });
});

it("does not invent a provider draft for an ordinary reply", async () => {
  vi.mocked(getReplyDraft).mockResolvedValue(undefined);
  await expect(resolveSendDraftId(undefined, identity)).resolves.toEqual({
    draftId: undefined,
    replacesUnconfirmedDraft: false,
  });
});
