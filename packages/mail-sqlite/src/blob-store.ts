import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createHash } from "node:crypto";
import type { BlobStore } from "@inboxzero/mail-core/ports/blob-store";

export function createFileBlobStore(directory: string): BlobStore {
  return {
    async stage(input) {
      await mkdir(directory, { recursive: true });
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of input.bytes) {
        chunks.push(chunk);
        size += chunk.byteLength;
        if (size > input.sizeBytes) {
          return { status: "rejected", code: "too_large" };
        }
      }
      const bytes = Buffer.concat(chunks);
      const checksum = createHash("sha256").update(bytes).digest("hex");
      if (checksum !== input.checksum) {
        return { status: "rejected", code: "checksum_mismatch" };
      }
      await writeFile(join(directory, `${input.blobId}.staging`), bytes);
      return { status: "staged" };
    },
    async finalize(blobId) {
      const staged = join(directory, `${blobId}.staging`);
      const finalPath = join(directory, blobId);
      try {
        const bytes = await readFile(staged);
        await writeFile(finalPath, bytes);
        await rm(staged, { force: true });
        return {
          blobId,
          sizeBytes: bytes.byteLength,
          checksum: createHash("sha256").update(bytes).digest("hex"),
        };
      } catch {
        return null;
      }
    },
    async read(blobId) {
      try {
        const bytes = await readFile(join(directory, blobId));
        return (async function* () {
          yield new Uint8Array(bytes);
        })();
      } catch {
        return null;
      }
    },
    async delete(blobId) {
      await rm(join(directory, blobId), { force: true });
      await rm(join(directory, `${blobId}.staging`), { force: true });
      await rm(join(directory, `${blobId}.meta.json`), { force: true });
    },
  };
}

export async function writeBlobMetadata(
  directory: string,
  blobId: string,
  metadata: { filename: string; contentType: string },
) {
  await mkdir(directory, { recursive: true });
  await writeFile(
    join(directory, `${blobId}.meta.json`),
    JSON.stringify(metadata),
  );
}

export async function readBlobMetadata(
  directory: string,
  blobId: string,
): Promise<{ filename: string; contentType: string } | null> {
  try {
    const raw = await readFile(join(directory, `${blobId}.meta.json`), "utf8");
    const parsed = JSON.parse(raw) as {
      filename?: string;
      contentType?: string;
    };
    return {
      filename: parsed.filename ?? blobId,
      contentType: parsed.contentType ?? "application/octet-stream",
    };
  } catch {
    return null;
  }
}
