import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import {
  DRAFT_ATTACHMENT_DIRECT_UPLOAD_LIMIT_BYTES,
  GMAIL_UPLOAD_CHUNK_BYTES,
  GRAPH_UPLOAD_CHUNK_BYTES,
} from "@/utils/email/draft-attachment-upload";
import { getDraftAttachmentUpload } from "@/utils/redis/draft-attachment-upload";
import { POST } from "./route";

const createEmailProvider = vi.hoisted(() => vi.fn());
const authMock = vi.hoisted(() => vi.fn());
const getEmailAccountMock = vi.hoisted(() => vi.fn());
const redisStore = vi.hoisted(() => new Map<string, unknown>());

vi.mock("@/utils/email/provider", () => ({ createEmailProvider }));
vi.mock("@/utils/auth", () => ({ auth: authMock }));
vi.mock("@/utils/redis/account-validation", () => ({
  getEmailAccount: getEmailAccountMock,
}));
vi.mock("@/utils/prisma");
vi.mock("@/utils/redis", () => ({
  redis: {
    get: async (key: string) => redisStore.get(key) ?? null,
    set: async (key: string, value: unknown) => {
      redisStore.set(key, value);
      return "OK";
    },
    del: async (key: string) => (redisStore.delete(key) ? 1 : 0),
  },
}));

const LARGE_SIZE = DRAFT_ATTACHMENT_DIRECT_UPLOAD_LIMIT_BYTES;
const SESSION_URI =
  "https://gmail.googleapis.com/upload/gmail/v1/users/me/drafts/r-1?uploadType=resumable&upload_id=session-1";
const provider = { startDraftAttachmentUpload: vi.fn() };

describe("POST /api/user/drafts/[draftId]/attachments/uploads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    redisStore.clear();
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    getEmailAccountMock.mockResolvedValue("developer@example.com");
    prisma.emailAccount.findUnique.mockResolvedValue({
      id: "account-1",
      account: { provider: "google" },
    } as never);
    createEmailProvider.mockResolvedValue(provider);
  });

  it("returns Microsoft's upload URL with the Graph chunk size", async () => {
    provider.startDraftAttachmentUpload.mockResolvedValue({
      type: "provider-url",
      uploadUrl: "https://outlook.office.com/upload/session-1",
    });
    const response = await start("draft-1", metadata(LARGE_SIZE));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      type: "provider-url",
      uploadUrl: "https://outlook.office.com/upload/session-1",
      chunkBytes: GRAPH_UPLOAD_CHUNK_BYTES,
    });
    expect(provider.startDraftAttachmentUpload).toHaveBeenCalledWith(
      "draft-1",
      metadata(LARGE_SIZE),
    );
    expect(redisStore.size).toBe(0);
  });

  it("keeps the Gmail session server-side and returns only an upload id", async () => {
    const parts = [
      { type: "text", text: "head" },
      { type: "attachment", attachmentId: "file-1", size: LARGE_SIZE },
    ];
    provider.startDraftAttachmentUpload.mockResolvedValue({
      type: "gmail-message",
      sessionUri: SESSION_URI,
      parts,
      totalBytes: 5_000_000,
    });
    const response = await start("r-1", metadata(LARGE_SIZE));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toEqual({
      type: "gmail-message",
      uploadId: expect.any(String),
      parts,
      totalBytes: 5_000_000,
      chunkBytes: GMAIL_UPLOAD_CHUNK_BYTES,
    });
    expect(JSON.stringify(body)).not.toContain("session-1");
    await expect(
      getDraftAttachmentUpload("account-1", body.uploadId),
    ).resolves.toEqual({
      draftId: "r-1",
      attachmentId: "file-1",
      sessionUri: SESSION_URI,
      totalBytes: 5_000_000,
      nextOffset: 0,
    });
    await expect(
      getDraftAttachmentUpload("account-2", body.uploadId),
    ).resolves.toBeNull();
  });

  it("rejects a file small enough for the direct upload", async () => {
    const response = await start(
      "draft-1",
      metadata(DRAFT_ATTACHMENT_DIRECT_UPLOAD_LIMIT_BYTES - 1),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining("3 MiB"),
    });
    expect(provider.startDraftAttachmentUpload).not.toHaveBeenCalled();
  });

  it("rejects metadata that could break a MIME header", async () => {
    const response = await start("draft-1", {
      ...metadata(LARGE_SIZE),
      filename: "evil\r\nBcc: someone@example.com",
    });
    expect(response.status).toBe(400);
    expect(provider.startDraftAttachmentUpload).not.toHaveBeenCalled();
  });

  it("rejects metadata missing a required field", async () => {
    const { id: _id, ...withoutId } = metadata(LARGE_SIZE);
    const response = await start("draft-1", withoutId);
    expect(response.status).toBe(400);
    expect(provider.startDraftAttachmentUpload).not.toHaveBeenCalled();
  });

  it("does not open an upload for an account the user does not own", async () => {
    prisma.emailAccount.findUnique.mockResolvedValue(null);
    const response = await start("draft-1", metadata(LARGE_SIZE), "account-2");
    expect(response.status).toBe(404);
    expect(createEmailProvider).not.toHaveBeenCalled();
    expect(provider.startDraftAttachmentUpload).not.toHaveBeenCalled();
  });

  it("rejects an unauthenticated request", async () => {
    authMock.mockResolvedValue(null);
    const response = await start("draft-1", metadata(LARGE_SIZE));
    expect(response.status).toBe(401);
    expect(provider.startDraftAttachmentUpload).not.toHaveBeenCalled();
  });
});

function start(draftId: string, body: unknown, accountId = "account-1") {
  return POST(
    new NextRequest(
      `http://127.0.0.1/api/user/drafts/${draftId}/attachments/uploads`,
      {
        method: "POST",
        headers: {
          cookie: "better-auth.session_token=session",
          "content-type": "application/json",
          [EMAIL_ACCOUNT_HEADER]: accountId,
        },
        body: JSON.stringify(body),
      },
    ),
    { params: Promise.resolve({ draftId }) },
  );
}

function metadata(size: number) {
  return {
    id: "file-1",
    filename: "report.pdf",
    mimeType: "application/pdf",
    size,
    disposition: "attachment" as const,
  };
}
