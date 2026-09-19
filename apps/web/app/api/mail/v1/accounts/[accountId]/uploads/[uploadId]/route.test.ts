import { mkdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createScopedLogger } from "@/utils/logger";
import {
  accountMailUploadDirectory,
  holdAccountUploads,
} from "@/utils/mail-api/upload-blobs";
import { createFileBlobStore } from "@inboxzero/mail-sqlite/blob-store";
import { DELETE } from "./route";

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

describe("DELETE /uploads/[uploadId]", () => {
  afterEach(async () => {
    await rm(accountMailUploadDirectory(accountId), {
      recursive: true,
      force: true,
    });
  });

  it("returns 409 invalid when a send still needs the blob", async () => {
    await stageReadyBlob("file-1");
    await holdAccountUploads(accountId, ["file-1"]);
    const response = await DELETE(deleteRequest("file-1"), params("file-1"));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid", retryable: false },
    });
    const store = createFileBlobStore(accountMailUploadDirectory(accountId));
    expect(await store.read("file-1")).not.toBeNull();
  });

  it("deletes an unheld blob", async () => {
    await stageReadyBlob("file-1");
    const response = await DELETE(deleteRequest("file-1"), params("file-1"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      status: "deleted",
      blobId: "file-1",
    });
  });
});

async function stageReadyBlob(blobId: string) {
  const directory = accountMailUploadDirectory(accountId);
  await mkdir(directory, { recursive: true });
  const store = createFileBlobStore(directory);
  const bytes = Buffer.from("blob", "utf8");
  const checksum = createHash("sha256").update(bytes).digest("hex");
  expect(
    await store.stage({
      blobId,
      bytes: (async function* () {
        yield bytes;
      })(),
      checksum,
      sizeBytes: bytes.byteLength,
    }),
  ).toEqual({ status: "staged" });
  expect(await store.finalize(blobId)).toMatchObject({ blobId });
}

function deleteRequest(uploadId: string) {
  return new NextRequest(
    `http://localhost/api/mail/v1/accounts/acc-1/uploads/${uploadId}?protocolVersion=1`,
    { method: "DELETE" },
  );
}

function params(uploadId: string) {
  return {
    params: Promise.resolve({ accountId, uploadId }),
  } as never;
}
