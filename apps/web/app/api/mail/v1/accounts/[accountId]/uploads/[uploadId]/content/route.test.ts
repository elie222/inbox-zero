import { createHash } from "node:crypto";
import { rm } from "node:fs/promises";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";
import {
  accountMailUploadDirectory,
  admitAccountUpload,
} from "@/utils/mail-api/upload-blobs";
import { PUT } from "./route";

vi.mock("server-only", () => ({}));

vi.mock("@/utils/middleware", () => ({
  withEmailProvider:
    (
      _name: string,
      handler: (
        request: NextRequest & Record<string, unknown>,
        context: {
          params: Promise<{ accountId: string; uploadId: string }>;
        },
      ) => Promise<Response>,
    ) =>
    (
      request: NextRequest,
      context: { params: Promise<{ accountId: string; uploadId: string }> },
    ) =>
      handler(
        Object.assign(request, {
          auth: { emailAccountId: "acc-1", userId: "user-1" },
          emailProvider: {
            name: "google",
            localMailSyncStrategy: "history",
          },
          logger: createScopedLogger("test"),
        }),
        context,
      ),
}));

const accountId = "acc-1";

describe("PUT /uploads/[uploadId]/content", () => {
  afterEach(async () => {
    await rm(accountMailUploadDirectory(accountId), {
      recursive: true,
      force: true,
    });
  });

  it("returns not_found when the upload was not admitted", async () => {
    const response = await PUT(
      contentRequest("file-1", new Uint8Array([1, 2, 3])),
      params("file-1"),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "not_found", retryable: false },
    });
  });

  it("cancels an unread body when the upload was not admitted", async () => {
    const cancel = vi.fn();
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array([1, 2, 3]));
      },
      cancel,
    });
    const response = await PUT(
      new NextRequest(
        "http://localhost/api/mail/v1/accounts/acc-1/uploads/file-1/content?protocolVersion=1",
        {
          method: "PUT",
          body,
          duplex: "half",
        } as RequestInit,
      ),
      params("file-1"),
    );
    expect(response.status).toBe(404);
    expect(cancel).toHaveBeenCalled();
  });

  it("returns invalid for a path-escape upload id", async () => {
    const response = await PUT(
      contentRequest("../escape", new Uint8Array([1])),
      params("../escape"),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid", retryable: false },
    });
  });

  it("returns invalid when the checksum does not match", async () => {
    const bytes = Buffer.from("streamed");
    await admitAccountUpload(accountId, {
      uploadId: "file-1",
      checksum: "deadbeef",
      sizeBytes: bytes.byteLength,
      filename: "note.txt",
      contentType: "text/plain",
    });
    const response = await PUT(
      contentRequest("file-1", bytes),
      params("file-1"),
    );
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid", retryable: false },
    });
  });

  it("returns too_large when the body exceeds the admitted size", async () => {
    const bytes = Buffer.from("streamed");
    const checksum = createHash("sha256").update(bytes).digest("hex");
    await admitAccountUpload(accountId, {
      uploadId: "file-1",
      checksum,
      sizeBytes: 1,
      filename: "note.txt",
      contentType: "text/plain",
    });
    const response = await PUT(
      contentRequest("file-1", bytes),
      params("file-1"),
    );
    expect(response.status).toBe(507);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "too_large", retryable: false },
    });
  });

  it("streams admitted bytes and reports staged", async () => {
    const bytes = Buffer.from("streamed");
    const checksum = createHash("sha256").update(bytes).digest("hex");
    await admitAccountUpload(accountId, {
      uploadId: "file-1",
      checksum,
      sizeBytes: bytes.byteLength,
      filename: "note.txt",
      contentType: "text/plain",
    });
    const response = await PUT(
      contentRequest("file-1", bytes),
      params("file-1"),
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "staged",
      blobId: "file-1",
      sizeBytes: bytes.byteLength,
      checksum,
    });
  });

  it("cancels the request body when the client aborts", async () => {
    const bytes = Buffer.from("streamed");
    const checksum = createHash("sha256").update(bytes).digest("hex");
    await admitAccountUpload(accountId, {
      uploadId: "file-1",
      checksum,
      sizeBytes: bytes.byteLength,
      filename: "note.txt",
      contentType: "text/plain",
    });
    const cancel = vi.fn();
    const abort = new AbortController();
    const body = new ReadableStream<Uint8Array>({
      pull() {
        abort.abort();
      },
      cancel,
    });
    const response = await PUT(
      new NextRequest(
        "http://localhost/api/mail/v1/accounts/acc-1/uploads/file-1/content?protocolVersion=1",
        {
          method: "PUT",
          body,
          signal: abort.signal,
          duplex: "half",
        } as RequestInit,
      ),
      params("file-1"),
    );
    expect(cancel).toHaveBeenCalled();
    expect(response.status).toBeGreaterThanOrEqual(400);
  });
});

function contentRequest(uploadId: string, body: Uint8Array) {
  return new NextRequest(
    `http://localhost/api/mail/v1/accounts/acc-1/uploads/${uploadId}/content?protocolVersion=1`,
    {
      method: "PUT",
      body,
      duplex: "half",
    } as RequestInit,
  );
}

function params(uploadId: string) {
  return {
    params: Promise.resolve({ accountId, uploadId }),
  } as never;
}
