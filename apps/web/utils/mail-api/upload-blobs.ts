import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { rm } from "node:fs/promises";
import { blobIdSchema } from "@inboxzero/mail-core/identities";
import {
  createFileBlobStore,
  deleteUnheldBlob,
  hasFinalizedBlob,
  holdBlob,
  readBlobMetadata,
  releaseBlobHold,
  writeBlobMetadata,
} from "@inboxzero/mail-sqlite/blob-store";

export function accountMailUploadDirectory(accountId: string) {
  return join(tmpdir(), "inbox-zero-mail-uploads", accountId);
}

export async function deleteAccountUploadDirectory(accountId: string) {
  const directory = resolvedAccountUploadDirectory(accountId);
  if (!directory) return;
  await rm(directory, { recursive: true, force: true });
}

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
  await writeBlobMetadata(accountMailUploadDirectory(accountId), parsed.data, {
    filename: input.filename,
    contentType: input.contentType,
    checksum: input.checksum,
    sizeBytes: input.sizeBytes,
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
  const directory = accountMailUploadDirectory(accountId);
  const metadata = await readBlobMetadata(directory, parsed.data);
  if (!metadata?.checksum || metadata.sizeBytes == null) {
    return { status: "missing" as const };
  }
  const store = createFileBlobStore(directory);
  try {
    const staged = await store.stage({
      blobId: parsed.data,
      bytes,
      checksum: metadata.checksum,
      sizeBytes: metadata.sizeBytes,
    });
    if (staged.status !== "staged") {
      return { status: "rejected" as const, code: staged.code };
    }
    const finalized = await store.finalize(parsed.data);
    if (!finalized) return { status: "unavailable" as const };
    return {
      status: "staged" as const,
      blobId: finalized.blobId,
      sizeBytes: finalized.sizeBytes,
      checksum: finalized.checksum,
    };
  } catch (error) {
    if (isDiskFullError(error)) {
      return { status: "rejected" as const, code: "too_large" as const };
    }
    throw error;
  }
}

export async function inspectAccountUpload(
  accountId: string,
  uploadId: string,
) {
  const parsed = blobIdSchema.safeParse(uploadId);
  if (!parsed.success) return { status: "invalid" as const };
  if (
    !(await hasFinalizedBlob(
      accountMailUploadDirectory(accountId),
      parsed.data,
    ))
  ) {
    return { status: "missing" as const };
  }
  return { status: "ready" as const, blobId: parsed.data };
}

export async function cancelAccountUpload(accountId: string, uploadId: string) {
  const parsed = blobIdSchema.safeParse(uploadId);
  if (!parsed.success) return { status: "invalid" as const };
  const directory = accountMailUploadDirectory(accountId);
  if ((await deleteUnheldBlob(directory, parsed.data)) === "in_use") {
    return { status: "in_use" as const, blobId: parsed.data };
  }
  return { status: "deleted" as const, blobId: parsed.data };
}

export async function setAccountUploadHold(
  accountId: string,
  uploadId: string,
  held: boolean,
) {
  const parsed = blobIdSchema.safeParse(uploadId);
  if (!parsed.success) return { status: "invalid" as const };
  const directory = accountMailUploadDirectory(accountId);
  if (!held) {
    await releaseBlobHold(directory, parsed.data);
    return { status: "released" as const, blobId: parsed.data };
  }
  const result = await holdBlob(directory, parsed.data);
  if (result === "missing") return { status: "missing" as const };
  return { status: "held" as const, blobId: parsed.data };
}

export async function holdAccountUploads(accountId: string, blobIds: string[]) {
  const directory = accountMailUploadDirectory(accountId);
  for (const blobId of blobIds) {
    const parsed = blobIdSchema.safeParse(blobId);
    if (!parsed.success) continue;
    await holdBlob(directory, parsed.data);
  }
}

export async function releaseAccountUploadHolds(
  accountId: string,
  blobIds: string[],
) {
  const directory = accountMailUploadDirectory(accountId);
  for (const blobId of blobIds) {
    const parsed = blobIdSchema.safeParse(blobId);
    if (!parsed.success) continue;
    await releaseBlobHold(directory, parsed.data);
  }
}

function isDiskFullError(error: unknown) {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return error.code === "ENOSPC" || error.code === "EDQUOT";
}

function resolvedAccountUploadDirectory(accountId: string) {
  if (!accountId) return null;
  const root = resolve(join(tmpdir(), "inbox-zero-mail-uploads"));
  const directory = resolve(accountMailUploadDirectory(accountId));
  if (directory === root || !directory.startsWith(`${root}${sep}`)) {
    return null;
  }
  return directory;
}
