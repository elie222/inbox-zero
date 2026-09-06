import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockEmailAccountWithAccount } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { deleteDraftAction, updateDraftAction } from "@/utils/actions/mail";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));

const mocks = vi.hoisted(() => ({
  createEmailProvider: vi.fn(),
  deleteDraft: vi.fn(),
  updateDraft: vi.fn(),
  getDraft: vi.fn(),
  getDraftReferenceForMessage: vi.fn(),
  markTrackedDraftDeleted: vi.fn(),
}));

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: mocks.createEmailProvider,
}));
vi.mock("@/utils/ai/draft-cleanup", () => ({
  markTrackedDraftDeleted: mocks.markTrackedDraftDeleted,
}));

const EMAIL_ACCOUNT_ID = "email-account-1";

describe("deleteDraftAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    prisma.emailAccount.findUnique.mockResolvedValue(
      getMockEmailAccountWithAccount({
        email: "user@example.com",
        userId: "user-1",
        provider: "google",
      }),
    );
    mocks.createEmailProvider.mockResolvedValue({
      deleteDraft: mocks.deleteDraft,
      updateDraft: mocks.updateDraft,
      getDraft: mocks.getDraft,
      getDraftReferenceForMessage: mocks.getDraftReferenceForMessage,
    });
    mocks.getDraftReferenceForMessage.mockResolvedValue({
      id: "draft-1",
      version: 'W/"version-1"',
    });
    mocks.deleteDraft.mockResolvedValue(true);
  });

  it("saves edits using the stable draft ID after Gmail replaces its message ID", async () => {
    mocks.getDraft.mockResolvedValue({ id: "new-message" });
    const result = await updateDraftAction(EMAIL_ACCOUNT_ID, {
      draftMessageId: "old-message",
      draftId: "draft-1",
      messageHtml: "<p>Edited</p>",
      subject: "",
      to: "person@example.com",
      cc: "",
      bcc: "",
    });
    expect(result?.data).toEqual({ draftId: "draft-1" });
    expect(mocks.updateDraft).toHaveBeenCalledWith("draft-1", {
      messageHtml: "<p>Edited</p>",
      subject: "",
      to: "person@example.com",
      cc: "",
      bcc: "",
    });
  });

  it("does not update a draft that has been sent or deleted", async () => {
    mocks.getDraft.mockResolvedValue(null);
    const result = await updateDraftAction(EMAIL_ACCOUNT_ID, {
      draftMessageId: "old-message",
      draftId: "draft-1",
      messageHtml: "<p>Edited</p>",
      subject: "Reply",
      to: "person@example.com",
      cc: "",
      bcc: "",
    });
    expect(result?.serverError).toBeTruthy();
    expect(mocks.updateDraft).not.toHaveBeenCalled();
  });

  it("discards an autosaved draft using its current message and version", async () => {
    mocks.getDraft.mockResolvedValue({ id: "new-message" });
    await deleteDraftAction(EMAIL_ACCOUNT_ID, {
      draftMessageId: "old-message",
      draftId: "draft-1",
    });
    expect(mocks.getDraftReferenceForMessage).toHaveBeenCalledWith(
      "new-message",
    );
    expect(mocks.deleteDraft).toHaveBeenCalledWith("draft-1", 'W/"version-1"');
  });

  it("updates tracking after the provider deletes the draft", async () => {
    const result = await deleteDraftAction(EMAIL_ACCOUNT_ID, {
      draftMessageId: "message-1",
    });

    expect(result?.serverError).toBeUndefined();
    expect(mocks.markTrackedDraftDeleted).toHaveBeenCalledWith(
      expect.objectContaining({
        draftId: "draft-1",
        emailAccountId: EMAIL_ACCOUNT_ID,
      }),
    );
  });

  it("preserves tracking when the draft changes before deletion", async () => {
    mocks.deleteDraft.mockResolvedValue(false);

    const result = await deleteDraftAction(EMAIL_ACCOUNT_ID, {
      draftMessageId: "message-1",
    });

    expect(result?.serverError).toBeUndefined();
    expect(mocks.deleteDraft).toHaveBeenCalledWith("draft-1", 'W/"version-1"');
    expect(mocks.markTrackedDraftDeleted).not.toHaveBeenCalled();
  });

  it("reports when the provider draft cannot be found", async () => {
    mocks.getDraftReferenceForMessage.mockResolvedValue(null);

    const result = await deleteDraftAction(EMAIL_ACCOUNT_ID, {
      draftMessageId: "message-1",
    });

    expect(result?.serverError).toBe("Could not find this draft to delete.");
    expect(mocks.deleteDraft).not.toHaveBeenCalled();
    expect(mocks.markTrackedDraftDeleted).not.toHaveBeenCalled();
  });

  it("completes deletion when the tracking update fails", async () => {
    mocks.markTrackedDraftDeleted.mockRejectedValue(
      new Error("Database unavailable"),
    );

    const result = await deleteDraftAction(EMAIL_ACCOUNT_ID, {
      draftMessageId: "message-1",
    });

    expect(result?.serverError).toBeUndefined();
    expect(mocks.deleteDraft).toHaveBeenCalledWith("draft-1", 'W/"version-1"');
  });
});
