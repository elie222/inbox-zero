import { tmpdir } from "node:os";
import { join } from "node:path";
import { blobIdSchema } from "@inboxzero/mail-core/identities";
import { createFileBlobStore } from "@inboxzero/mail-sqlite/blob-store";

export function accountMailUploadDirectory(accountId: string) {
  return join(tmpdir(), "inbox-zero-mail-uploads", accountId);
}

export async function inspectAccountUpload(
  accountId: string,
  uploadId: string,
) {
  const parsed = blobIdSchema.safeParse(uploadId);
  if (!parsed.success) return { status: "invalid" as const };
  const store = createFileBlobStore(accountMailUploadDirectory(accountId));
  const bytes = await store.read(parsed.data);
  if (!bytes) return { status: "missing" as const };
  return { status: "ready" as const, blobId: parsed.data };
}

export async function cancelAccountUpload(accountId: string, uploadId: string) {
  const parsed = blobIdSchema.safeParse(uploadId);
  if (!parsed.success) return { status: "invalid" as const };
  const store = createFileBlobStore(accountMailUploadDirectory(accountId));
  await store.delete(parsed.data);
  return { status: "deleted" as const, blobId: parsed.data };
}
