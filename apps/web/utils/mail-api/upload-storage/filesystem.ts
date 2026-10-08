import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createFileBlobStore } from "@inboxzero/mail-sqlite/blob-store";
import { env } from "@/env";

export function createFilesystemUploadStore(directory?: string) {
  // Uploads are runtime data, so they must not be included in the server bundle.
  const root = resolve(
    /* turbopackIgnore: true */
    directory ??
      env.MAIL_UPLOAD_DIR ??
      join(tmpdir(), "inbox-zero-mail-uploads"),
  );
  return createFileBlobStore(root);
}
