import { beforeEach, expect, it, vi } from "vitest";
import type { EmailProvider } from "@/utils/email/types";
import { createScopedLogger } from "@/utils/logger";
import {
  markComposeSessionSent,
  recordComposeSessionDraft,
} from "@/utils/redis/compose-session-draft";
import {
  saveComposeDraft,
  discardComposeDraft,
  discardDraftReplacedBySend,
  sendComposeDraft,
} from "./compose-draft";

vi.mock("@/utils/redis/compose-session-draft", () => ({
  recordComposeSessionDraft: vi.fn(),
  markComposeSessionSent: vi.fn(),
}));

const provider = {
  createDraft: vi.fn(),
  updateDraft: vi.fn(),
  getDraft: vi.fn(),
  getDraftReferenceForMessage: vi.fn(),
  deleteDraft: vi.fn(),
  sendDraft: vi.fn(),
} as unknown as EmailProvider;
const content = {
  to: "recipient@example.com",
  subject: "Example draft",
  messageHtml: "<p>Example</p>",
  attachments: [],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(provider.createDraft).mockResolvedValue({ id: "draft-1" });
  vi.mocked(provider.updateDraft).mockResolvedValue(undefined);
  vi.mocked(provider.getDraft).mockResolvedValue({ id: "message-1" } as never);
  vi.mocked(provider.getDraftReferenceForMessage).mockResolvedValue({
    id: "draft-1",
    version: "v1",
  });
  vi.mocked(provider.deleteDraft).mockResolvedValue(true);
});

it("returns the provider reference before attempting attachment updates", async () => {
  expect(await saveComposeDraft({ provider, content })).toEqual({
    draftId: "draft-1",
    messageId: "message-1",
    threadId: null,
  });
  expect(provider.createDraft).toHaveBeenCalledOnce();
  expect(provider.updateDraft).not.toHaveBeenCalled();
});
it("creates the mailbox draft already addressed, so a copy synced before the next save can still be sent", async () => {
  await saveComposeDraft({ provider, content });
  expect(provider.createDraft).toHaveBeenCalledWith(
    expect.objectContaining({ to: content.to }),
  );
});
it("creates the mailbox draft with its Cc and Bcc so they survive a sync before the next save", async () => {
  await saveComposeDraft({
    provider,
    content: {
      ...content,
      cc: "copied@example.com",
      bcc: "hidden@example.com",
      replyToEmail: { threadId: "thread-1", messageId: "parent-1" },
    },
  });
  expect(provider.createDraft).toHaveBeenCalledWith(
    expect.objectContaining({
      cc: "copied@example.com",
      bcc: "hidden@example.com",
      replyToMessageId: "parent-1",
    }),
  );
});
it("keeps the confirmed draft id when the mailbox message cannot be loaded yet", async () => {
  vi.mocked(provider.getDraft).mockRejectedValueOnce(new Error("timeout"));
  expect(await saveComposeDraft({ provider, content })).toEqual({
    draftId: "draft-1",
    messageId: null,
    threadId: null,
  });
});
it("retries updates using the existing provider draft and clears omitted recipients", async () => {
  vi.mocked(provider.updateDraft).mockRejectedValueOnce(
    new Error("Upload failed"),
  );
  await expect(
    saveComposeDraft({ provider, draftId: "draft-1", content }),
  ).rejects.toThrow("Upload failed");
  expect(
    await saveComposeDraft({ provider, draftId: "draft-1", content }),
  ).toEqual({
    draftId: "draft-1",
    messageId: "message-1",
    threadId: null,
  });
  expect(provider.createDraft).not.toHaveBeenCalled();
  expect(provider.updateDraft).toHaveBeenLastCalledWith("draft-1", {
    to: content.to,
    subject: content.subject,
    messageHtml: content.messageHtml,
    cc: "",
    bcc: "",
  });
});
it("never replaces the attachments already on the mailbox draft when saving", async () => {
  await saveComposeDraft({
    provider,
    draftId: "draft-1",
    content: { ...content, attachments: [] },
  });
  expect(vi.mocked(provider.updateDraft).mock.calls[0]?.[1]).not.toHaveProperty(
    "attachments",
  );
});
it("rejects an unconfirmed creation", async () => {
  vi.mocked(provider.createDraft).mockResolvedValue({ id: "" });
  await expect(saveComposeDraft({ provider, content })).rejects.toThrow(
    "Could not confirm",
  );
});
it("conditionally discards the provider draft", async () => {
  await discardComposeDraft({ provider, draftId: "draft-1" });
  expect(provider.deleteDraft).toHaveBeenCalledWith("draft-1", "v1");
});
it("keeps local recovery possible when the provider rejects deletion", async () => {
  vi.mocked(provider.deleteDraft).mockResolvedValue(false);
  await expect(
    discardComposeDraft({ provider, draftId: "draft-1" }),
  ).rejects.toThrow("changed");
});
it("accepts discarding a draft already removed in the mailbox", async () => {
  vi.mocked(provider.getDraft).mockResolvedValue(null);
  await discardComposeDraft({ provider, draftId: "draft-1" });
  expect(provider.deleteDraft).not.toHaveBeenCalled();
});
it("updates and sends the provider draft directly", async () => {
  const sent = { messageId: "sent-1", threadId: "thread-1" };
  vi.mocked(provider.sendDraft).mockResolvedValue(sent);
  expect(
    await sendComposeDraft({ provider, draftId: "draft-1", email: content }),
  ).toEqual(sent);
  expect(provider.updateDraft).toHaveBeenCalledWith("draft-1", {
    to: content.to,
    subject: content.subject,
    messageHtml: content.messageHtml,
    cc: "",
    bcc: "",
  });
  expect(provider.sendDraft).toHaveBeenCalledWith("draft-1");
  expect(provider.createDraft).not.toHaveBeenCalled();
});
it("sends the attachments already on the mailbox draft instead of replacing them", async () => {
  vi.mocked(provider.sendDraft).mockResolvedValue({
    messageId: "sent-1",
    threadId: "thread-1",
  });
  await sendComposeDraft({
    provider,
    draftId: "draft-1",
    email: { ...content, attachments: [] },
  });
  expect(vi.mocked(provider.updateDraft).mock.calls[0]?.[1]).not.toHaveProperty(
    "attachments",
  );
});
it("does not send when updating the draft fails", async () => {
  vi.mocked(provider.updateDraft).mockRejectedValue(new Error("Draft missing"));
  await expect(
    sendComposeDraft({ provider, draftId: "draft-1", email: content }),
  ).rejects.toThrow("Draft missing");
  expect(provider.sendDraft).not.toHaveBeenCalled();
});

it("creates a provider reply draft in the original conversation", async () => {
  await saveComposeDraft({
    provider,
    content: {
      ...content,
      replyToEmail: { threadId: "thread-1", messageId: "parent-1" },
    },
  });
  expect(provider.createDraft).toHaveBeenCalledWith(
    expect.objectContaining({
      replyToMessageId: "parent-1",
    }),
  );
});

it("creates a forward draft from the forwarded message so its files travel with it", async () => {
  await saveComposeDraft({
    provider,
    content: {
      ...content,
      replyToEmail: { threadId: "thread-1", forwardedMessageId: "source-1" },
    },
  });
  expect(provider.createDraft).toHaveBeenCalledWith(
    expect.objectContaining({ forwardedMessageId: "source-1" }),
  );
});

const composeSession = {
  id: "session-1",
  emailAccountId: "account-1",
  logger: createScopedLogger("test"),
};

it("records the session's draft so a replacing send can remove it", async () => {
  vi.mocked(recordComposeSessionDraft).mockResolvedValue(false);

  await saveComposeDraft({ provider, content, composeSession });

  expect(recordComposeSessionDraft).toHaveBeenCalledWith({
    emailAccountId: "account-1",
    sessionId: "session-1",
    draftId: "draft-1",
  });
  expect(provider.deleteDraft).not.toHaveBeenCalled();
});

// The send was delivered while this save was on its way, so nothing else
// will ever remove the draft it created.
it("removes a draft saved after its session was sent", async () => {
  vi.mocked(recordComposeSessionDraft).mockResolvedValue(true);

  const saved = await saveComposeDraft({ provider, content, composeSession });

  expect(provider.deleteDraft).toHaveBeenCalledWith("draft-1", "v1");
  expect(saved).toEqual({
    draftId: "draft-1",
    messageId: null,
    threadId: null,
    sessionSent: true,
  });
});

it("keeps saving when the session record is unavailable", async () => {
  vi.mocked(recordComposeSessionDraft).mockRejectedValue(new Error("down"));

  const saved = await saveComposeDraft({ provider, content, composeSession });

  expect(saved.draftId).toBe("draft-1");
  expect(provider.deleteDraft).not.toHaveBeenCalled();
});

it("removes the draft a delivered send replaced", async () => {
  vi.mocked(markComposeSessionSent).mockResolvedValue(["draft-1"]);

  await discardDraftReplacedBySend({
    emailAccountId: "account-1",
    sessionId: "session-1",
    provider,
  });

  expect(markComposeSessionSent).toHaveBeenCalledWith({
    emailAccountId: "account-1",
    sessionId: "session-1",
  });
  expect(provider.deleteDraft).toHaveBeenCalledWith("draft-1", "v1");
});

it("leaves the mailbox alone when the session saved no draft yet", async () => {
  vi.mocked(markComposeSessionSent).mockResolvedValue([]);

  await discardDraftReplacedBySend({
    emailAccountId: "account-1",
    sessionId: "session-1",
    provider,
  });

  expect(provider.getDraft).not.toHaveBeenCalled();
  expect(provider.deleteDraft).not.toHaveBeenCalled();
});

// Two tabs reopening the same reply can each create a draft for the session.
it("removes every draft the session saved", async () => {
  vi.mocked(markComposeSessionSent).mockResolvedValue(["draft-1", "draft-2"]);
  vi.mocked(provider.getDraft).mockImplementation(
    async (draftId: string) => ({ id: `message-of-${draftId}` }) as never,
  );
  vi.mocked(provider.getDraftReferenceForMessage).mockImplementation(
    async (messageId: string) => ({
      id: messageId.replace("message-of-", ""),
      version: "v1",
    }),
  );

  await discardDraftReplacedBySend({
    emailAccountId: "account-1",
    sessionId: "session-1",
    provider,
  });

  expect(provider.deleteDraft).toHaveBeenCalledWith("draft-1", "v1");
  expect(provider.deleteDraft).toHaveBeenCalledWith("draft-2", "v1");
  expect(provider.deleteDraft).toHaveBeenCalledTimes(2);
});

it("still saves when a draft saved after its send cannot be removed", async () => {
  vi.useFakeTimers();
  vi.mocked(recordComposeSessionDraft).mockResolvedValue(true);
  vi.mocked(provider.deleteDraft).mockResolvedValue(false);

  const saving = saveComposeDraft({ provider, content, composeSession });
  await vi.runAllTimersAsync();

  await expect(saving).resolves.toMatchObject({ draftId: "draft-1" });
  expect(provider.deleteDraft).toHaveBeenCalledTimes(3);
  vi.useRealTimers();
});

it("retries recording a session draft once", async () => {
  vi.mocked(recordComposeSessionDraft)
    .mockRejectedValueOnce(new Error("busy"))
    .mockResolvedValueOnce(true);

  await saveComposeDraft({ provider, content, composeSession });

  expect(recordComposeSessionDraft).toHaveBeenCalledTimes(2);
  expect(provider.deleteDraft).toHaveBeenCalledWith("draft-1", "v1");
});
