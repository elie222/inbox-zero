import { beforeEach, describe, expect, it, vi } from "vitest";
import { getMockEmailAccountWithAccount } from "@/__tests__/helpers";
import prisma from "@/utils/__mocks__/prisma";
import { DraftNotFoundError } from "@/utils/error";
import { updateDraftAction } from "@/utils/actions/mail";

vi.mock("@/utils/prisma");
vi.mock("@/utils/auth", () => ({
  auth: vi.fn(async () => ({
    user: { id: "user-1", email: "user@example.com" },
  })),
}));

const mocks = vi.hoisted(() => ({
  createEmailProvider: vi.fn(),
  updateDraft: vi.fn(),
  getDraft: vi.fn(),
  getDraftReferenceForMessage: vi.fn(),
}));

vi.mock("@/utils/email/provider", () => ({
  createEmailProvider: mocks.createEmailProvider,
}));

const EMAIL_ACCOUNT_ID = "email-account-1";

describe("updateDraftAction", () => {
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
      updateDraft: mocks.updateDraft,
      getDraft: mocks.getDraft,
      getDraftReferenceForMessage: mocks.getDraftReferenceForMessage,
    });
    mocks.getDraftReferenceForMessage.mockResolvedValue({
      id: "draft-1",
      version: 'W/"version-1"',
    });
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
    expect(result?.data).toEqual({
      status: "saved",
      draftId: "draft-1",
      messageId: "new-message",
    });
    expect(mocks.updateDraft).toHaveBeenCalledWith("draft-1", {
      messageHtml: "<p>Edited</p>",
      subject: "",
      to: "person@example.com",
      cc: "",
      bcc: "",
    });
  });

  it("fails the save when the draft's current message cannot be read", async () => {
    mocks.getDraft.mockRejectedValueOnce(new Error("Provider unavailable"));
    const result = await updateDraftAction(EMAIL_ACCOUNT_ID, {
      draftMessageId: "old-message",
      draftId: "draft-1",
      messageHtml: "<p>Edited</p>",
      subject: "",
      to: "person@example.com",
      cc: "",
      bcc: "",
    });
    expect(result?.data).toBeUndefined();
    expect(result?.serverError).toBeTruthy();
  });

  it("saves reply and forward draft edits without incomplete recipients", async () => {
    mocks.getDraft.mockResolvedValue({ id: "new-message" });
    const result = await updateDraftAction(EMAIL_ACCOUNT_ID, {
      draftMessageId: "old-message",
      draftId: "draft-1",
      messageHtml: "<p>Edited</p>",
      subject: "Reply",
      to: '"Doe, Jane" <jane@example.com>, next@',
      cc: "copied@example.com, good@example.com next@",
      bcc: "hidden@example.com, Name <good@example.com",
    });

    expect(result?.data).toMatchObject({ status: "saved", draftId: "draft-1" });
    expect(mocks.updateDraft).toHaveBeenCalledWith("draft-1", {
      messageHtml: "<p>Edited</p>",
      subject: "Reply",
      to: '"Doe, Jane" <jane@example.com>',
      cc: "copied@example.com",
      bcc: "hidden@example.com",
    });
  });

  it("reports a missing draft when the provider no longer has it", async () => {
    mocks.updateDraft.mockRejectedValueOnce(
      new DraftNotFoundError("Could not find this draft to update."),
    );
    const result = await updateDraftAction(EMAIL_ACCOUNT_ID, {
      draftMessageId: "old-message",
      draftId: "draft-1",
      messageHtml: "<p>Edited</p>",
      subject: "Reply",
      to: "person@example.com",
      cc: "",
      bcc: "",
    });
    expect(result?.serverError).toBeUndefined();
    expect(result?.data).toEqual({ status: "missing" });
  });

  it("reports a missing draft when its message no longer maps to a draft", async () => {
    mocks.getDraftReferenceForMessage.mockResolvedValue(null);
    const result = await updateDraftAction(EMAIL_ACCOUNT_ID, {
      draftMessageId: "deleted-message",
      messageHtml: "<p>Edited</p>",
      subject: "Reply",
      to: "person@example.com",
      cc: "",
      bcc: "",
    });
    expect(result?.data).toEqual({ status: "missing" });
    expect(mocks.updateDraft).not.toHaveBeenCalled();
  });
});
