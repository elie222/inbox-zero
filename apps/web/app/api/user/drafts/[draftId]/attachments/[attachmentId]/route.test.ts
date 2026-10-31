import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import { DELETE } from "./route";

const createEmailProvider = vi.hoisted(() => vi.fn());
const authMock = vi.hoisted(() => vi.fn());
const getEmailAccountMock = vi.hoisted(() => vi.fn());

vi.mock("@/utils/email/provider", () => ({ createEmailProvider }));
vi.mock("@/utils/auth", () => ({ auth: authMock }));
vi.mock("@/utils/redis/account-validation", () => ({
  getEmailAccount: getEmailAccountMock,
}));
vi.mock("@/utils/prisma");

const provider = { removeDraftAttachment: vi.fn() };

describe("DELETE /api/user/drafts/[draftId]/attachments/[attachmentId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    getEmailAccountMock.mockResolvedValue("developer@example.com");
    prisma.emailAccount.findUnique.mockResolvedValue({
      id: "account-1",
      account: { provider: "microsoft" },
    } as never);
    createEmailProvider.mockResolvedValue(provider);
  });

  it("removes the attachment and returns the draft's remaining attachments", async () => {
    const remaining = {
      id: "att-2",
      filename: "kept.pdf",
      mimeType: "application/pdf",
      size: 10,
      disposition: "attachment",
      messageId: "message-2",
      providerAttachmentId: "att-2",
    };
    provider.removeDraftAttachment.mockResolvedValue({
      messageId: "message-2",
      attachments: [remaining],
    });
    const response = await remove("draft-1", "att-1");
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      messageId: "message-2",
      attachments: [remaining],
    });
    expect(provider.removeDraftAttachment).toHaveBeenCalledWith(
      "draft-1",
      "att-1",
    );
    expect(createEmailProvider).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAccountId: "account-1",
        provider: "microsoft",
      }),
    );
  });

  it("rejects an attachment id longer than any provider issues", async () => {
    const response = await remove("draft-1", "a".repeat(1025));
    expect(response.status).toBe(400);
    expect(provider.removeDraftAttachment).not.toHaveBeenCalled();
  });

  it("does not touch a draft on an account the user does not own", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(null);
    const response = await remove("draft-1", "att-1", "account-2");
    expect(response.status).toBe(404);
    expect(createEmailProvider).not.toHaveBeenCalled();
    expect(provider.removeDraftAttachment).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request", async () => {
    authMock.mockResolvedValue(null);
    const response = await remove("draft-1", "att-1");
    expect(response.status).toBe(401);
    expect(provider.removeDraftAttachment).not.toHaveBeenCalled();
  });
});

function remove(
  draftId: string,
  attachmentId: string,
  accountId = "account-1",
) {
  return DELETE(
    new NextRequest(
      `http://127.0.0.1/api/user/drafts/${draftId}/attachments/${attachmentId}`,
      {
        method: "DELETE",
        headers: {
          cookie: "better-auth.session_token=session",
          [EMAIL_ACCOUNT_HEADER]: accountId,
        },
      },
    ),
    { params: Promise.resolve({ draftId, attachmentId }) },
  );
}
