import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockEmailAccountWithAccount } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { deleteDraftAction } from "@/utils/actions/mail";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));

const mocks = vi.hoisted(() => ({
  createEmailProvider: vi.fn(),
  deleteDraft: vi.fn(),
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
      getDraftReferenceForMessage: mocks.getDraftReferenceForMessage,
    });
    mocks.getDraftReferenceForMessage.mockResolvedValue({
      id: "draft-1",
      version: 'W/"version-1"',
    });
    mocks.deleteDraft.mockResolvedValue(true);
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
