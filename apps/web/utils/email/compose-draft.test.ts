import { beforeEach, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import type { EmailProvider } from "@/utils/email/types";
import {
  saveComposeDraft,
  discardComposeDraft,
  sendComposeDraft,
} from "./compose-draft";

vi.mock("@/utils/prisma");
const provider = {
  createDraft: vi.fn(),
  updateDraft: vi.fn(),
  getDraft: vi.fn(),
  getDraftReferenceForMessage: vi.fn(),
  deleteDraft: vi.fn(),
  sendDraft: vi.fn(),
  sendEmailWithHtml: vi.fn(),
} as unknown as EmailProvider;
const input = {
  emailAccountId: "account-1",
  sessionId: "session-1",
  provider,
  content: {
    to: "recipient@example.com",
    cc: "copy@example.com",
    bcc: "private@example.com",
    subject: "Example draft",
    messageHtml: "<p>Example message</p>",
    attachments: [],
  },
};
const row = {
  id: "row-1",
  emailAccountId: input.emailAccountId,
  sessionId: input.sessionId,
  draftId: "draft-1",
  closed: false,
  savingAt: null,
  attachmentsHash: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

beforeEach(() => {
  vi.clearAllMocks();
  prisma.composeDraft.updateMany.mockResolvedValue({ count: 1 });
  prisma.composeDraft.update.mockResolvedValue(row);
  vi.mocked(provider.createDraft).mockResolvedValue({ id: "draft-1" });
  vi.mocked(provider.updateDraft).mockResolvedValue(undefined);
  vi.mocked(provider.getDraft).mockResolvedValue({ id: "message-1" } as never);
  vi.mocked(provider.getDraftReferenceForMessage).mockResolvedValue({
    id: "draft-1",
    version: "v1",
  });
  vi.mocked(provider.deleteDraft).mockResolvedValue(true);
});

it("creates one mailbox draft and persists its reference before uploading attachments", async () => {
  prisma.composeDraft.findUnique.mockResolvedValue(null);
  prisma.composeDraft.create.mockResolvedValue({ ...row, draftId: null });
  expect(await saveComposeDraft(input)).toBe("draft-1");
  expect(provider.createDraft).toHaveBeenCalledOnce();
  expect(provider.updateDraft).toHaveBeenCalledWith("draft-1", input.content);
  expect(prisma.composeDraft.update.mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(provider.updateDraft).mock.invocationCallOrder[0],
  );
});

it("reuses the draft after a lost response, including after an attachment upload fails", async () => {
  prisma.composeDraft.findUnique.mockResolvedValue(row);
  vi.mocked(provider.updateDraft).mockRejectedValueOnce(
    new Error("Upload failed"),
  );
  await expect(saveComposeDraft(input)).rejects.toThrow("Upload failed");
  expect(await saveComposeDraft(input)).toBe("draft-1");
  expect(provider.createDraft).not.toHaveBeenCalled();
});

it("does not create another draft while creation is in flight or uncertain", async () => {
  prisma.composeDraft.findUnique.mockResolvedValue({
    ...row,
    draftId: null,
    savingAt: new Date(),
  });
  await expect(saveComposeDraft(input)).rejects.toThrow();
  expect(provider.createDraft).not.toHaveBeenCalled();
});

it("rejects competing saves and writes to a finished compose session", async () => {
  prisma.composeDraft.findUnique.mockResolvedValue(row);
  prisma.composeDraft.updateMany.mockResolvedValue({ count: 0 });
  await expect(saveComposeDraft(input)).rejects.toThrow();
  prisma.composeDraft.findUnique.mockResolvedValue({ ...row, closed: true });
  await expect(saveComposeDraft(input)).rejects.toThrow();
  expect(provider.updateDraft).not.toHaveBeenCalled();
});

it("deletes the provider draft before marking a session discarded", async () => {
  prisma.composeDraft.findUnique.mockResolvedValue(row);
  await discardComposeDraft(input);
  expect(provider.deleteDraft).toHaveBeenCalledWith("draft-1", "v1");
  expect(prisma.composeDraft.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({ data: { closed: true, savingAt: null } }),
  );
});

it("keeps a draft recoverable when deletion fails", async () => {
  prisma.composeDraft.findUnique.mockResolvedValue(row);
  vi.mocked(provider.deleteDraft).mockResolvedValue(false);
  await expect(discardComposeDraft(input)).rejects.toThrow();
  expect(prisma.composeDraft.updateMany).not.toHaveBeenCalledWith(
    expect.objectContaining({
      data: expect.objectContaining({ closed: true }),
    }),
  );
});

it("sends the saved mailbox draft with the latest content instead of leaving an obsolete copy", async () => {
  prisma.composeDraft.findUnique.mockResolvedValue(row);
  vi.mocked(provider.sendDraft).mockResolvedValue({
    messageId: "sent-1",
    threadId: "thread-1",
  });
  expect(await sendComposeDraft({ ...input, email: input.content })).toEqual({
    messageId: "sent-1",
    threadId: "thread-1",
  });
  expect(provider.updateDraft).toHaveBeenCalledWith("draft-1", input.content);
  expect(provider.sendDraft).toHaveBeenCalledWith("draft-1");
  expect(provider.sendEmailWithHtml).not.toHaveBeenCalled();
  expect(prisma.composeDraft.updateMany).toHaveBeenCalledWith(
    expect.objectContaining({ data: { closed: true, savingAt: null } }),
  );
});

it("does not send another copy when a saved compose draft was already sent", async () => {
  prisma.composeDraft.findUnique.mockResolvedValue({ ...row, closed: true });
  await expect(
    sendComposeDraft({ ...input, email: input.content }),
  ).rejects.toThrow();
  expect(provider.sendDraft).not.toHaveBeenCalled();
  expect(provider.sendEmailWithHtml).not.toHaveBeenCalled();
});
