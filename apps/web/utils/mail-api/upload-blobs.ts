import { tmpdir } from "node:os";
import { join } from "node:path";
import { collectUnreferencedBlobs } from "@inboxzero/mail-sqlite/blob-store";

/** Abandoned uploads older than this are deleted. In-flight drafts still inside the window are kept. */
export const UPLOAD_BLOB_GRACE_MS = 24 * 60 * 60 * 1000;

export function accountMailUploadDirectory(accountId: string) {
  return join(tmpdir(), "inbox-zero-mail-uploads", accountId);
}

export async function collectStaleMailUploads(input: {
  accountId: string;
  keepIds?: Iterable<string>;
  nowMs?: number;
  graceMs?: number;
}) {
  return collectUnreferencedBlobs({
    directory: accountMailUploadDirectory(input.accountId),
    referencedIds: input.keepIds ?? [],
    nowMs: input.nowMs ?? Date.now(),
    graceMs: input.graceMs ?? UPLOAD_BLOB_GRACE_MS,
  });
}
