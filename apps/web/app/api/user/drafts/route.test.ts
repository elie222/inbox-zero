import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import prisma from "@/utils/__mocks__/prisma";
import { GET, POST } from "./route";

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
};

describe("/api/user/drafts", () => {
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
    provider.getDraftReferenceForMessage.mockResolvedValue({
      id: "provider-draft",
    });
    mockProvider("google");
  });

  it("reads a complete draft using the provider's message-to-draft mapping", async () => {
    provider.getDraft.mockResolvedValue({
      id: "message-1",
      threadId: "thread-1",
      subject: "Complete",
      headers: {
        from: "sender@example.com",
        to: "to@example.com",
        cc: "cc@example.com",
        bcc: "bcc@example.com",
      },
      textHtml: "<p><strong>Complete rich body</strong></p>".repeat(100),
      textPlain: "Complete body",
      inline: [],
      attachments: [],
      snippet: "Truncated",
    });
    const response = await readDraft("message-1");
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toMatchObject({
      draftId: "provider-draft",
      messageId: "message-1",
      bcc: "bcc@example.com",
      html: "<p><strong>Complete rich body</strong></p>".repeat(100),
      attachments: [],
    });
    expect(provider.getDraft).toHaveBeenCalledWith("provider-draft", {
      includeAttachments: true,
    });
  });

  it("rejects draft reads without a session", async () => {
    authMock.mockResolvedValue(null);
    expect((await readDraft("message-1")).status).toBe(401);
    expect(provider.getDraftReferenceForMessage).not.toHaveBeenCalled();
  });

  it("rejects draft reads from another user's account", async () => {
    getEmailAccountMock.mockResolvedValue(null);
    expect((await readDraft("message-1")).status).toBe(403);
    expect(provider.getDraftReferenceForMessage).not.toHaveBeenCalled();
  });

  it("rejects reads without a message id before contacting the provider", async () => {
    expect((await readDraft()).status).toBe(400);
    expect(provider.getDraftReferenceForMessage).not.toHaveBeenCalled();
  });

  it("reports a missing draft instead of returning empty editable content", async () => {
    provider.getDraftReferenceForMessage.mockResolvedValue(null);
    const response = await readDraft("message-1");
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(provider.getDraft).not.toHaveBeenCalled();
  });

  it("reports a provider read failure instead of returning an empty draft", async () => {
    provider.getDraftReferenceForMessage.mockRejectedValue(
      new Error("Provider unavailable"),
    );
    expect((await readDraft("message-1")).status).toBe(500);
    expect(provider.getDraft).not.toHaveBeenCalled();
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

function readDraft(messageId?: string) {
  return GET(
    new NextRequest(
      `http://127.0.0.1/api/user/drafts${messageId ? `?messageId=${messageId}` : ""}`,
      {
        headers: {
          cookie: "better-auth.session_token=session",
          [EMAIL_ACCOUNT_HEADER]: emailAccountId,
        },
      },
    ),
    { params: Promise.resolve({}) },
  );
}
