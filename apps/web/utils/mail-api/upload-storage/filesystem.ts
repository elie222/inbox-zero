import { constants } from "node:fs";
import { lstat, mkdir, open, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { env } from "@/env";
import { createObjectBlobStore } from "./object-store";

export function createFilesystemUploadStore(directory?: string) {
  // Uploads are runtime data, so they must not be included in the server bundle.
  const root = resolve(
    /* turbopackIgnore: true */
    directory ??
      env.MAIL_UPLOAD_DIR ??
      join(tmpdir(), "inbox-zero-mail-uploads"),
  );
  return createObjectBlobStore({
    async put(key, bytes) {
      await mkdir(root, { recursive: true, mode: 0o700 });
      const handle = await open(
        join(root, key),
        constants.O_CREAT |
          constants.O_WRONLY |
          constants.O_TRUNC |
          constants.O_NOFOLLOW,
        0o600,
      );
      try {
        for await (const chunk of bytes) {
          let offset = 0;
          while (offset < chunk.byteLength) {
            const { bytesWritten } = await handle.write(
              chunk,
              offset,
              chunk.byteLength - offset,
            );
            if (bytesWritten === 0)
              throw new Error("Attachment write made no progress");
            offset += bytesWritten;
          }
        }
        await handle.sync();
      } finally {
        await handle.close();
      }
    },
    async read(key) {
      const path = join(root, key);
      try {
        const info = await lstat(path);
        if (!info.isFile()) throw new Error("Invalid attachment file");
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "ENOENT"
        )
          return null;
        throw error;
      }
      return (async function* () {
        const handle = await open(
          path,
          constants.O_RDONLY | constants.O_NOFOLLOW,
        );
        try {
          for await (const chunk of handle.createReadStream()) yield chunk;
        } finally {
          await handle.close();
        }
      })();
    },
    async delete(key) {
      await rm(join(root, key), { force: true });
    },
  });
}
