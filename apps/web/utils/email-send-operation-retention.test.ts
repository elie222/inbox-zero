import { beforeEach, describe, expect, it, vi } from "vitest";
import { mkdir, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { EmailSendOperationStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { MAIL_MUTATION_RETRY_WINDOW_MS } from "@/utils/email/send-operation-policy";
import { deleteExpiredEmailSendOperations } from "./email-send-operation-retention";
import {
  accountMailUploadDirectory,
  holdAccountUploads,
  releaseAccountUploadHolds,
} from "@/utils/mail-api/upload-blobs";
import { createFileBlobStore } from "@inboxzero/mail-sqlite/blob-store";

vi.mock("@/utils/prisma");

describe("deleteExpiredEmailSendOperations", () => {
  beforeEach(() => vi.clearAllMocks());

  it("deletes only terminal operations outside the retry window", async () => {
    const now = new Date("2026-08-25T12:00:00.000Z");
    prisma.emailSendOperation.findMany.mockResolvedValue([]);

    const deleted = await deleteExpiredEmailSendOperations(now);

    expect(deleted).toBe(0);
    expect(prisma.emailSendOperation.findMany).toHaveBeenCalledWith({
      where: {
        status: {
          in: [
            EmailSendOperationStatus.SENT,
            EmailSendOperationStatus.UNCERTAIN,
          ],
        },
        updatedAt: {
          lt: new Date(now.getTime() - MAIL_MUTATION_RETRY_WINDOW_MS),
        },
      },
      select: { id: true, emailAccountId: true, attachmentIds: true },
    });
    expect(prisma.emailSendOperation.deleteMany).not.toHaveBeenCalled();
  });

  it("deletes staged blobs for expired uncertain sends", async () => {
    const accountId = "acc-send-op-retention";
    const blobId = "blob-expired";
    const directory = accountMailUploadDirectory(accountId);
    await rm(directory, { recursive: true, force: true });
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

    prisma.emailSendOperation.findMany.mockResolvedValue([
      { id: "op-1", emailAccountId: accountId, attachmentIds: [blobId] },
    ] as never);
    prisma.emailSendOperation.deleteMany.mockResolvedValue({ count: 1 });

    await expect(deleteExpiredEmailSendOperations()).resolves.toBe(1);
    expect(await store.read(blobId)).toBeNull();
    expect(prisma.emailSendOperation.deleteMany).toHaveBeenCalledWith({
      where: expiredDeleteWhere(["op-1"]),
    });
    await rm(directory, { recursive: true, force: true });
  });

  it("leaves held blobs for a later in-flight send", async () => {
    const accountId = "acc-send-op-retention-held";
    const blobId = "blob-held";
    const directory = accountMailUploadDirectory(accountId);
    await rm(directory, { recursive: true, force: true });
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
    await holdAccountUploads(accountId, [blobId]);

    prisma.emailSendOperation.findMany.mockResolvedValue([
      { id: "op-held", emailAccountId: accountId, attachmentIds: [blobId] },
    ] as never);
    prisma.emailSendOperation.deleteMany.mockResolvedValue({ count: 1 });

    await expect(deleteExpiredEmailSendOperations()).resolves.toBe(1);
    expect(await store.read(blobId)).not.toBeNull();
    expect(prisma.emailSendOperation.deleteMany).toHaveBeenCalledWith({
      where: expiredDeleteWhere(["op-held"]),
    });
    await releaseAccountUploadHolds(accountId, [blobId]);
    await rm(directory, { recursive: true, force: true });
  });
});

function expiredDeleteWhere(ids: string[]) {
  return {
    id: { in: ids },
    status: {
      in: [EmailSendOperationStatus.SENT, EmailSendOperationStatus.UNCERTAIN],
    },
    updatedAt: {
      lt: expect.any(Date),
    },
  };
}
