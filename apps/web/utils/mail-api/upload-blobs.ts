import { createHash } from "node:crypto";
import { blobIdSchema } from "@inboxzero/mail-core/identities";
import {
  collectBlobBytes,
  isAdmissibleBlobSize,
} from "@inboxzero/mail-core/ports/blob-store";
import type { Attachment } from "@/utils/types/mail";
import prisma from "@/utils/prisma";

// A send holds its uploads only while it is in flight; anything older is a
// hold the browser never released, not an upload the mailbox still needs.
const HOLD_TTL_MS = 60 * 60 * 1000;

export async function admitAccountUpload(
  accountId: string,
  input: {
    uploadId: string;
    checksum: string;
    sizeBytes: number;
    filename: string;
    contentType: string;
  },
) {
  const parsed = blobIdSchema.safeParse(input.uploadId);
  if (!parsed.success) return { status: "invalid" as const };
  if (!isAdmissibleBlobSize(input.sizeBytes)) {
    return { status: "invalid" as const };
  }
  const metadata = {
    filename: input.filename,
    contentType: input.contentType,
    checksum: input.checksum,
    sizeBytes: input.sizeBytes,
  };
  await prisma.mailUpload.upsert({
    where: {
      emailAccountId_blobId: { emailAccountId: accountId, blobId: parsed.data },
    },
    create: { emailAccountId: accountId, blobId: parsed.data, ...metadata },
    // Re-admitting the same id restarts the upload, so any half-finished
    // content and its hold are discarded.
    update: { ...metadata, content: null, heldAt: null },
  });
  return { status: "admitted" as const, blobId: parsed.data };
}

export async function putAccountUploadContent(
  accountId: string,
  uploadId: string,
  bytes: AsyncIterable<Uint8Array>,
) {
  const parsed = blobIdSchema.safeParse(uploadId);
  if (!parsed.success) return { status: "invalid" as const };
  const admitted = await prisma.mailUpload.findUnique({
    where: {
      emailAccountId_blobId: { emailAccountId: accountId, blobId: parsed.data },
    },
    select: { checksum: true, sizeBytes: true },
  });
  if (!admitted) return { status: "missing" as const };
  const collected = await collectBlobBytes(bytes, admitted.sizeBytes);
  if (collected.status === "too_large") {
    return { status: "rejected" as const, code: "too_large" as const };
  }
  if (
    collected.bytes.byteLength !== admitted.sizeBytes ||
    createHash("sha256").update(collected.bytes).digest("hex") !==
      admitted.checksum
  ) {
    return { status: "rejected" as const, code: "checksum_mismatch" as const };
  }
  const updated = await prisma.mailUpload.updateMany({
    where: { emailAccountId: accountId, blobId: parsed.data },
    data: { content: collected.bytes },
  });
  // The upload was cancelled while its content was still streaming in.
  if (updated.count === 0) return { status: "missing" as const };
  return {
    status: "staged" as const,
    blobId: parsed.data,
    sizeBytes: collected.bytes.byteLength,
    checksum: admitted.checksum,
  };
}

export async function inspectAccountUpload(
  accountId: string,
  uploadId: string,
) {
  const parsed = blobIdSchema.safeParse(uploadId);
  if (!parsed.success) return { status: "invalid" as const };
  const staged = await prisma.mailUpload.findFirst({
    where: {
      emailAccountId: accountId,
      blobId: parsed.data,
      content: { not: null },
    },
    select: { id: true },
  });
  if (!staged) return { status: "missing" as const };
  return { status: "ready" as const, blobId: parsed.data };
}

export async function cancelAccountUpload(accountId: string, uploadId: string) {
  const parsed = blobIdSchema.safeParse(uploadId);
  if (!parsed.success) return { status: "invalid" as const };
  const deleted = await prisma.mailUpload.deleteMany({
    where: {
      emailAccountId: accountId,
      blobId: parsed.data,
      OR: [{ heldAt: null }, { heldAt: { lt: expiredHoldBefore() } }],
    },
  });
  if (deleted.count > 0) {
    return { status: "deleted" as const, blobId: parsed.data };
  }
  const held = await prisma.mailUpload.findUnique({
    where: {
      emailAccountId_blobId: { emailAccountId: accountId, blobId: parsed.data },
    },
    select: { id: true },
  });
  if (held) return { status: "in_use" as const, blobId: parsed.data };
  return { status: "deleted" as const, blobId: parsed.data };
}

export async function setAccountUploadHold(
  accountId: string,
  uploadId: string,
  held: boolean,
) {
  const parsed = blobIdSchema.safeParse(uploadId);
  if (!parsed.success) return { status: "invalid" as const };
  if (!held) {
    await releaseAccountUploadHolds(accountId, [parsed.data]);
    return { status: "released" as const, blobId: parsed.data };
  }
  const heldCount = await holdAccountUploads(accountId, [parsed.data]);
  if (heldCount === 0) return { status: "missing" as const };
  return { status: "held" as const, blobId: parsed.data };
}

export async function holdAccountUploads(accountId: string, blobIds: string[]) {
  if (blobIds.length === 0) return 0;
  const held = await prisma.mailUpload.updateMany({
    where: {
      emailAccountId: accountId,
      blobId: { in: blobIds },
      content: { not: null },
    },
    data: { heldAt: new Date() },
  });
  return held.count;
}

export async function releaseAccountUploadHolds(
  accountId: string,
  blobIds: string[],
) {
  if (blobIds.length === 0) return;
  await prisma.mailUpload.updateMany({
    where: { emailAccountId: accountId, blobId: { in: blobIds } },
    data: { heldAt: null },
  });
}

export async function readAccountUploads(accountId: string, blobIds: string[]) {
  if (blobIds.length === 0) {
    return { status: "ok" as const, uploads: [] as Attachment[] };
  }
  const rows = await prisma.mailUpload.findMany({
    where: {
      emailAccountId: accountId,
      blobId: { in: blobIds },
      content: { not: null },
    },
    select: {
      blobId: true,
      filename: true,
      contentType: true,
      content: true,
    },
  });
  const byBlobId = new Map(rows.map((row) => [row.blobId, row]));
  const uploads: Attachment[] = [];
  for (const blobId of blobIds) {
    const row = byBlobId.get(blobId);
    if (!row?.content) return { status: "missing" as const, blobId };
    // Buffer.from(Uint8Array) copies the whole attachment; a view does not.
    const content = Buffer.from(
      row.content.buffer,
      row.content.byteOffset,
      row.content.byteLength,
    );
    uploads.push({
      filename: row.filename,
      contentType: row.contentType,
      content: content.toString("base64"),
      size: content.byteLength,
    });
  }
  return { status: "ok" as const, uploads };
}

export async function deleteAccountUploads(
  accountId: string,
  blobIds: string[],
) {
  if (blobIds.length === 0) return;
  await prisma.mailUpload.deleteMany({
    where: { emailAccountId: accountId, blobId: { in: blobIds } },
  });
}

export async function deleteStaleMailUploads(olderThan: Date) {
  const result = await prisma.mailUpload.deleteMany({
    where: { updatedAt: { lt: olderThan } },
  });
  return result.count;
}

function expiredHoldBefore() {
  return new Date(Date.now() - HOLD_TTL_MS);
}
