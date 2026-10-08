import { createFileBlobStore } from "@inboxzero/mail-sqlite/blob-store";

export function createFilesystemUploadStore(directory: string) {
  return createFileBlobStore(directory);
}
