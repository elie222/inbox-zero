import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import prisma from "@/utils/__mocks__/prisma";
import { POST } from "./route";

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
};

describe("POST /api/user/drafts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    getEmailAccountMock.mockResolvedValue("developer@example.com");
    provider.createDraft.mockResolvedValue({ id: "draft-1" });
    provider.updateDraft.mockResolvedValue(undefined);
    provider.getDraft.mockResolvedValue({
      id: "message-1",
      threadId: "thread-1",
    });
    createEmailProvider.mockResolvedValue(provider);
    mockProvider("google");
  });

  it("rejects a request without a session", async () => {
    authMock.mockResolvedValue(null);

    const response = await createDraft(draftBody());

    expect(response.status).toBe(401);
    expect(createEmailProvider).not.toHaveBeenCalled();
    expect(provider.createDraft).not.toHaveBeenCalled();
  });

  it("rejects an email account the user does not own", async () => {
    getEmailAccountMock.mockResolvedValue(null);

    const response = await createDraft(draftBody());

    expect(response.status).toBe(403);
    expect(provider.createDraft).not.toHaveBeenCalled();
  });

  it("rejects a body without draft content", async () => {
    const response = await createDraft({ content: { subject: "Draft" } });

    expect(response.status).toBe(400);
    expect(provider.createDraft).not.toHaveBeenCalled();
  });

  it.each([
    "google",
    "microsoft",
  ] as const)("creates a %s draft with the account provider", async (providerName) => {
    mockProvider(providerName);

    const response = await createDraft(draftBody());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      draftId: "draft-1",
      messageId: "message-1",
      threadId: "thread-1",
    });
    expect(createEmailProvider).toHaveBeenCalledWith({
      emailAccountId,
      provider: providerName,
      logger: expect.objectContaining({ error: expect.any(Function) }),
    });
    expect(provider.createDraft).toHaveBeenCalledWith({
      to: "",
      subject: "Draft",
      messageHtml: "<p>Hello</p>",
    });
  });

  it("updates an existing draft when the body already has a draft id", async () => {
    const response = await createDraft({
      ...draftBody(),
      draftId: "draft-existing",
    });

    expect(response.status).toBe(200);
    expect(provider.createDraft).not.toHaveBeenCalled();
    expect(provider.updateDraft).toHaveBeenCalledWith(
      "draft-existing",
      expect.objectContaining({ subject: "Draft" }),
    );
  });
});

function mockProvider(providerName: string) {
  prisma.emailAccount.findUnique.mockResolvedValue({
    id: emailAccountId,
    account: { provider: providerName },
  } as never);
}

function draftBody() {
  return {
    content: {
      to: "teammate@example.com",
      subject: "Draft",
      messageHtml: "<p>Hello</p>",
    },
  };
}

function createDraft(body: unknown) {
  return POST(
    new NextRequest("http://127.0.0.1/api/user/drafts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        cookie: "better-auth.session_token=session",
        [EMAIL_ACCOUNT_HEADER]: emailAccountId,
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({}) },
  );
}
