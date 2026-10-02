import { createHash } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { installMailUploadTable } from "@/__tests__/mocks/mail-upload.mock";
import { EmailSendOperationStatus } from "@/generated/prisma/enums";
import prisma from "@/utils/__mocks__/prisma";
import { MAIL_MUTATION_RETRY_WINDOW_MS } from "@/utils/email/send-operation-policy";
import {
  admitAccountUpload,
  inspectAccountUpload,
  putAccountUploadContent,
} from "@/utils/mail-api/upload-blobs";
import { deleteExpiredEmailSendOperations } from "./email-send-operation-retention";

vi.mock("@/utils/prisma");

describe("deleteExpiredEmailSendOperations", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    installMailUploadTable(prisma);
  });

  it("deletes only terminal operations outside the retry window", async () => {
    const now = new Date("2026-08-25T12:00:00.000Z");
    prisma.emailSendOperation.deleteMany.mockResolvedValue({ count: 2 });

    await expect(deleteExpiredEmailSendOperations(now)).resolves.toBe(2);

    expect(prisma.emailSendOperation.deleteMany).toHaveBeenCalledWith({
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
    });
  });

  it("deletes undo holds whose send can no longer be retried", async () => {
    const now = new Date("2026-08-25T12:00:00.000Z");
    prisma.emailSendOperation.deleteMany.mockResolvedValue({ count: 0 });

    await deleteExpiredEmailSendOperations(now);

    expect(prisma.scheduledEmail.deleteMany).toHaveBeenCalledWith({
      where: {
        heldForUndo: true,
        status: { in: ["SENT", "CANCELLED", "FAILED", "UNCERTAIN"] },
        updatedAt: {
          lt: new Date(now.getTime() - MAIL_MUTATION_RETRY_WINDOW_MS),
        },
      },
    });
  });

  it("deletes staged uploads no send can still claim", async () => {
    const accountId = "acc-send-op-retention";
    await stageUpload(accountId, "blob-expired");
    prisma.emailSendOperation.deleteMany.mockResolvedValue({ count: 0 });

    const beforeStaging = new Date(
      Date.now() - 1000 + MAIL_MUTATION_RETRY_WINDOW_MS,
    );
    await deleteExpiredEmailSendOperations(beforeStaging);
    expect(await inspectAccountUpload(accountId, "blob-expired")).toMatchObject(
      { status: "ready" },
    );

    const afterStaging = new Date(
      Date.now() + 1000 + MAIL_MUTATION_RETRY_WINDOW_MS,
    );
    await deleteExpiredEmailSendOperations(afterStaging);
    expect(await inspectAccountUpload(accountId, "blob-expired")).toEqual({
      status: "missing",
    });
  });
});

async function stageUpload(accountId: string, blobId: string) {
  const bytes = Buffer.from("blob", "utf8");
  await admitAccountUpload(accountId, {
    uploadId: blobId,
    checksum: createHash("sha256").update(bytes).digest("hex"),
    sizeBytes: bytes.byteLength,
    filename: "note.txt",
    contentType: "text/plain",
  });
  await putAccountUploadContent(
    accountId,
    blobId,
    (async function* () {
      yield bytes;
    })(),
  );
}
