import { createHash } from "node:crypto";
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installMailUploadTable } from "@/__tests__/mocks/mail-upload.mock";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/__mocks__/prisma";
import {
  admitAccountUpload,
  holdAccountUploads,
  inspectAccountUpload,
  putAccountUploadContent,
} from "@/utils/mail-api/upload-blobs";
import { DELETE, POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/utils/prisma");

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
  beforeEach(() => {
    installMailUploadTable(prisma);
  });

  it("returns 409 invalid when a send still needs the blob", async () => {
    await stageReadyBlob("file-1");
    await holdAccountUploads(accountId, ["file-1"]);
    const response = await DELETE(deleteRequest("file-1"), params("file-1"));
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "invalid", retryable: false },
    });
    expect(await inspectAccountUpload(accountId, "file-1")).toEqual({
      status: "ready",
      blobId: "file-1",
    });
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

  it("holds a ready blob so DELETE stays 409 until the hold is released", async () => {
    await stageReadyBlob("file-1");
    const held = await POST(holdRequest("file-1", true), params("file-1"));
    expect(held.status).toBe(200);
    await expect(held.json()).resolves.toMatchObject({
      status: "held",
      blobId: "file-1",
    });
    const blocked = await DELETE(deleteRequest("file-1"), params("file-1"));
    expect(blocked.status).toBe(409);
    const released = await POST(holdRequest("file-1", false), params("file-1"));
    expect(released.status).toBe(200);
    await expect(released.json()).resolves.toMatchObject({
      status: "released",
      blobId: "file-1",
    });
    const deleted = await DELETE(deleteRequest("file-1"), params("file-1"));
    expect(deleted.status).toBe(200);
  });

  it("returns 404 when holding a missing blob", async () => {
    const response = await POST(
      holdRequest("missing-1", true),
      params("missing-1"),
    );
    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "not_found", retryable: false },
    });
  });

  it("returns a retryable 503 when a release could not be written", async () => {
    await stageReadyBlob("file-1");
    expect(
      (await POST(holdRequest("file-1", true), params("file-1"))).status,
    ).toBe(200);
    prisma.mailUpload.updateMany.mockRejectedValueOnce(new Error("no db"));

    // Reporting "released" here would leave the client believing the hold is
    // gone while every later DELETE answers 409.
    const response = await POST(holdRequest("file-1", false), params("file-1"));
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "unavailable", retryable: true },
    });
    expect(
      (await DELETE(deleteRequest("file-1"), params("file-1"))).status,
    ).toBe(409);
  });

  it("returns 400 when the upload id is invalid", async () => {
    const response = await POST(
      holdRequest("../escape", true),
      params("../escape"),
    );
    expect(response.status).toBe(400);
  });
});

async function stageReadyBlob(blobId: string) {
  const bytes = Buffer.from("blob", "utf8");
  await admitAccountUpload(accountId, {
    uploadId: blobId,
    checksum: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.byteLength,
    filename: "note.txt",
    contentType: "text/plain",
  });
  expect(
    await putAccountUploadContent(
      accountId,
      blobId,
      (async function* () {
        yield bytes;
      })(),
    ),
  ).toMatchObject({ status: "staged" });
}

function holdRequest(uploadId: string, held: boolean) {
  return new NextRequest(
    `http://localhost/api/mail/v1/accounts/acc-1/uploads/${uploadId}`,
    {
      method: "POST",
      body: JSON.stringify({
        protocolVersion: 1,
        requestId: "req-hold",
        session: { accountId: "acc-1", generation: "local" },
        held,
      }),
    },
  );
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
