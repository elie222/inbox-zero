import { beforeEach, expect, it, vi } from "vitest";
import type { EmailProvider } from "@/utils/email/types";
import {
  saveComposeDraft,
  discardComposeDraft,
  sendComposeDraft,
} from "./compose-draft";

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
    ...content,
    cc: "",
    bcc: "",
  });
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
    ...content,
    cc: "",
    bcc: "",
  });
  expect(provider.sendDraft).toHaveBeenCalledWith("draft-1");
  expect(provider.createDraft).not.toHaveBeenCalled();
});
it("does not send when updating the draft fails", async () => {
  vi.mocked(provider.updateDraft).mockRejectedValue(new Error("Draft missing"));
  await expect(
    sendComposeDraft({ provider, draftId: "draft-1", email: content }),
  ).rejects.toThrow("Draft missing");
  expect(provider.sendDraft).not.toHaveBeenCalled();
});
