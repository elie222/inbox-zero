import { createHash } from "node:crypto";
import { blobIdSchema } from "@inboxzero/mail-core/identities";
import {
  collectBlobBytes,
  isAdmissibleBlobSize,
} from "@inboxzero/mail-core/ports/blob-store";
import type { Attachment } from "@/utils/types/mail";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";

const logger = createScopedLogger("mail-api/upload-blobs");

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
    // Writing against the admission these bytes were verified against keeps a
    // re-admission that landed mid-stream from taking content it never checked.
    where: {
      emailAccountId: accountId,
      blobId: parsed.data,
      checksum: admitted.checksum,
      sizeBytes: admitted.sizeBytes,
    },
    data: { content: collected.bytes },
  });
  // The upload was cancelled or restarted while its content was streaming in.
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
    const released = await releaseAccountUploadHolds(accountId, [parsed.data]);
    // The caller asked for this release and can retry it, so it has to hear
    // that the hold is still there rather than read "released" and move on.
    if (!released) return { status: "unavailable" as const };
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

// Reports whether the release landed. The send paths run this from a `finally`
// and ignore the answer, because throwing there would discard a result the
// mailbox has already committed; the expired hold is the backstop for them.
export async function releaseAccountUploadHolds(
  accountId: string,
  blobIds: string[],
) {
  if (blobIds.length === 0) return true;
  try {
    await prisma.mailUpload.updateMany({
      where: { emailAccountId: accountId, blobId: { in: blobIds } },
      data: { heldAt: null },
    });
    return true;
  } catch (error) {
    logger.warn("Failed to release upload holds", { error, blobIds });
    return false;
  }
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
  // A send that already reached the mailbox must not fail because its staged
  // bytes could not be swept up; the retention sweep is the backstop.
  try {
    await prisma.mailUpload.deleteMany({
      where: { emailAccountId: accountId, blobId: { in: blobIds } },
    });
  } catch (error) {
    logger.warn("Failed to delete consumed uploads", { error, blobIds });
  }
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
