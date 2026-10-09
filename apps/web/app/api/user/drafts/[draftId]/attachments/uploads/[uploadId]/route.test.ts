import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import prisma from "@/utils/__mocks__/prisma";
import { EMAIL_ACCOUNT_HEADER } from "@/utils/config";
import { GMAIL_UPLOAD_CHUNK_BYTES } from "@/utils/email/draft-attachment-upload";
import { saveDraftAttachmentUpload } from "@/utils/redis/draft-attachment-upload";
import { PUT } from "./route";

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

const SESSION_URI =
  "https://gmail.googleapis.com/upload/gmail/v1/users/me/drafts/r-1?uploadType=resumable&upload_id=session-1";
const UPLOAD_ID = "6f1f8f53-3c2e-4b0e-9a55-0c8bdb2e1f10";
const TOTAL_BYTES = GMAIL_UPLOAD_CHUNK_BYTES + 10;
const fetchMock = vi.fn();
const provider = {
  getAccessToken: vi.fn(() => "access-token"),
  getDraftAttachments: vi.fn(),
};

describe("/api/user/drafts/[draftId]/attachments/uploads/[uploadId]", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    redisStore.clear();
    vi.stubGlobal("fetch", fetchMock);
    authMock.mockResolvedValue({ user: { id: "user-1" } });
    getEmailAccountMock.mockResolvedValue("developer@example.com");
    prisma.emailAccount.findUnique.mockResolvedValue({
      id: "account-1",
      account: { provider: "google" },
    } as never);
    createEmailProvider.mockResolvedValue(provider);
    provider.getDraftAttachments.mockResolvedValue({
      messageId: "message-2",
      attachments: [],
    });
    await saveDraftAttachmentUpload("account-1", UPLOAD_ID, {
      draftId: "r-1",
      attachmentId: "file-1",
      sessionUri: SESSION_URI,
      totalBytes: TOTAL_BYTES,
      nextOffset: 0,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forwards a chunk to the stored Gmail session with the account token", async () => {
    fetchMock.mockResolvedValue(
      new Response(null, {
        status: 308,
        headers: { Range: `bytes=0-${GMAIL_UPLOAD_CHUNK_BYTES - 1}` },
      }),
    );
    const response = await putChunk({
      start: 0,
      length: GMAIL_UPLOAD_CHUNK_BYTES,
    });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: "incomplete",
      nextOffset: GMAIL_UPLOAD_CHUNK_BYTES,
    });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(SESSION_URI);
    expect(init.headers).toMatchObject({
      Authorization: "Bearer access-token",
      "Content-Range": `bytes 0-${GMAIL_UPLOAD_CHUNK_BYTES - 1}/${TOTAL_BYTES}`,
    });
  });

  it("returns the draft's attachments once Gmail accepts the last chunk", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(null, {
        status: 308,
        headers: { Range: `bytes=0-${GMAIL_UPLOAD_CHUNK_BYTES - 1}` },
      }),
    );
    await putChunk({ start: 0, length: GMAIL_UPLOAD_CHUNK_BYTES });
    fetchMock.mockResolvedValueOnce(Response.json({ id: "r-1" }));
    const response = await putChunk({
      start: GMAIL_UPLOAD_CHUNK_BYTES,
      length: 10,
    });
    await expect(response.json()).resolves.toEqual({
      status: "complete",
      attachmentId: "file-1",
      messageId: "message-2",
      attachments: [],
    });
    const retry = await putChunk({
      start: GMAIL_UPLOAD_CHUNK_BYTES,
      length: 10,
    });
    expect(retry.status).toBe(404);
  });

  it("finds nothing for an upload id that belongs to another account", async () => {
    const response = await putChunk({
      start: 0,
      length: GMAIL_UPLOAD_CHUNK_BYTES,
      accountId: "account-2",
    });
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("finds nothing when the upload belongs to a different draft", async () => {
    const response = await putChunk({
      start: 0,
      length: GMAIL_UPLOAD_CHUNK_BYTES,
      draftId: "r-2",
    });
    expect(response.status).toBe(404);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a chunk larger than one request may carry", async () => {
    const response = await putChunk({
      start: 0,
      length: GMAIL_UPLOAD_CHUNK_BYTES + 10,
    });
    expect(response.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a chunk that skips ahead of what Gmail has", async () => {
    const response = await putChunk({
      start: GMAIL_UPLOAD_CHUNK_BYTES,
      length: 10,
    });
    expect(response.status).toBe(409);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a body that does not match its declared range", async () => {
    const response = await putChunk({
      start: 0,
      length: GMAIL_UPLOAD_CHUNK_BYTES,
      bodyLength: 100,
    });
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rejects a range for a different message size", async () => {
    const response = await putChunk({
      start: 0,
      length: GMAIL_UPLOAD_CHUNK_BYTES,
      total: TOTAL_BYTES + 1,
    });
    expect(response.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

function putChunk({
  start,
  length,
  total = TOTAL_BYTES,
  bodyLength = length,
  accountId = "account-1",
  draftId = "r-1",
}: {
  start: number;
  length: number;
  total?: number;
  bodyLength?: number;
  accountId?: string;
  draftId?: string;
}) {
  if (accountId !== "account-1")
    prisma.emailAccount.findUnique.mockResolvedValue({
      id: accountId,
      account: { provider: "google" },
    } as never);
  return PUT(
    new NextRequest(
      `http://127.0.0.1/api/user/drafts/${draftId}/attachments/uploads/${UPLOAD_ID}`,
      {
        method: "PUT",
        headers: {
          cookie: "better-auth.session_token=session",
          [EMAIL_ACCOUNT_HEADER]: accountId,
          "content-range": `bytes ${start}-${start + length - 1}/${total}`,
        },
        body: new Uint8Array(bodyLength),
      },
    ),
    { params: Promise.resolve({ draftId, uploadId: UPLOAD_ID }) },
  );
}
