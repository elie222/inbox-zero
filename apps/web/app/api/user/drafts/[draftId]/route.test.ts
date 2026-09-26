import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import prisma from "@/utils/__mocks__/prisma";
import { DELETE, PUT } from "./route";

const createEmailProvider = vi.hoisted(() => vi.fn());
const authMock = vi.hoisted(() => vi.fn());
const getEmailAccountMock = vi.hoisted(() => vi.fn());

vi.mock("@/utils/email/provider", () => ({ createEmailProvider }));
vi.mock("@/utils/auth", () => ({ auth: authMock }));
vi.mock("@/utils/redis/account-validation", () => ({
  getEmailAccount: getEmailAccountMock,
}));
vi.mock("@/utils/prisma");

const emailAccountId = "account-1";
const provider = {
  createDraft: vi.fn(),
  updateDraft: vi.fn(),
  getDraft: vi.fn(),
  getDraftReferenceForMessage: vi.fn(),
  deleteDraft: vi.fn(),
};

describe("/api/user/drafts/[draftId]", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    getEmailAccountMock.mockResolvedValue("developer@example.com");
    prisma.emailAccount.findUnique.mockResolvedValue({
      id: emailAccountId,
      account: { provider: "google" },
    } as never);
    provider.createDraft.mockResolvedValue({ id: "draft-created" });
    provider.updateDraft.mockResolvedValue(undefined);
    provider.getDraft.mockResolvedValue({
      id: "message-1",
      threadId: "thread-1",
    });
    provider.getDraftReferenceForMessage.mockResolvedValue({
      id: "draft-1",
      version: "v1",
    });
    provider.deleteDraft.mockResolvedValue(true);
    createEmailProvider.mockResolvedValue(provider);
  });

  it("rejects an update without a session", async () => {
    authMock.mockResolvedValue(null);

    const response = await update("draft-1", draftBody());

    expect(response.status).toBe(401);
    expect(provider.updateDraft).not.toHaveBeenCalled();
  });

  it("updates the draft named by the path", async () => {
    const response = await update("draft-1", {
      ...draftBody("Updated"),
      draftId: "some-other-draft",
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      draftId: "draft-1",
      messageId: "message-1",
      threadId: "thread-1",
    });
    expect(provider.createDraft).not.toHaveBeenCalled();
    expect(provider.updateDraft).toHaveBeenCalledWith(
      "draft-1",
      expect.objectContaining({
        to: "teammate@example.com",
        subject: "Updated",
        messageHtml: "<p>Updated</p>",
      }),
    );
  });

  it("rejects an update with an invalid body", async () => {
    const response = await update("draft-1", {});

    expect(response.status).toBe(400);
    expect(provider.updateDraft).not.toHaveBeenCalled();
  });

  it("rejects a discard without a session", async () => {
    authMock.mockResolvedValue(null);

    const response = await discard("draft-1");

    expect(response.status).toBe(401);
    expect(provider.deleteDraft).not.toHaveBeenCalled();
  });

  it("discards the provider draft", async () => {
    const response = await discard("draft-1");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ success: true });
    expect(provider.deleteDraft).toHaveBeenCalledWith("draft-1", "v1");
  });

  it("rejects a discard when the mailbox draft changed", async () => {
    provider.deleteDraft.mockResolvedValue(false);

    const response = await discard("draft-1");

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("changed"),
      isKnownError: true,
    });
  });
});

function draftBody(message = "Hello") {
  return {
    content: {
      to: "teammate@example.com",
      subject: message === "Hello" ? "Draft" : message,
      messageHtml: `<p>${message}</p>`,
    },
  };
}

function update(draftId: string, body: unknown) {
  return PUT(
    new NextRequest(`http://127.0.0.1/api/user/drafts/${draftId}`, {
      method: "PUT",
      headers: accountHeaders({ "content-type": "application/json" }),
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ draftId }) },
  );
}

function discard(draftId: string) {
  return DELETE(
    new NextRequest(`http://127.0.0.1/api/user/drafts/${draftId}`, {
      method: "DELETE",
      headers: accountHeaders(),
    }),
    { params: Promise.resolve({ draftId }) },
  );
}

function accountHeaders(extra?: HeadersInit) {
  return {
    cookie: "better-auth.session_token=session",
    [EMAIL_ACCOUNT_HEADER]: emailAccountId,
    ...extra,
  };
}
