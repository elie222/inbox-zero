import { createHash } from "node:crypto";
import { blobIdSchema } from "@inboxzero/mail-core/identities";
import {
  type BlobReference,
  type BlobStore,
  isAdmissibleBlobSize,
} from "@inboxzero/mail-core/ports/blob-store";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("mail-api/upload-storage");

type ObjectStorage = {
  put(
    key: string,
    bytes: AsyncIterable<Uint8Array>,
    sizeBytes: number,
  ): Promise<void>;
  read(key: string): Promise<AsyncIterable<Uint8Array> | null>;
  delete(key: string): Promise<void>;
};

// A small publication record keeps stage/finalize durable across instances
// without downloading and uploading the attachment again during finalize.
export function createObjectBlobStore(objects: ObjectStorage): BlobStore {
  return {
    async stage(input) {
      const key = blobIdSchema.parse(input.blobId);
      if (!isAdmissibleBlobSize(input.sizeBytes)) {
        return { status: "rejected", code: "too_large" };
      }
      let rejected: "too_large" | "checksum_mismatch" | undefined;
      let verifiedComplete = false;
      const verified = (async function* () {
        const hash = createHash("sha256");
        let size = 0;
        let pending: Uint8Array | undefined;
        for await (const chunk of input.bytes) {
          size += chunk.byteLength;
          if (size > input.sizeBytes) {
            rejected = "too_large";
            throw new Error("Upload exceeds admitted size");
          }
          hash.update(chunk);
          if (chunk.byteLength === 0) continue;
          // Withhold the last chunk until verification: a transport can return
          // as soon as Content-Length is satisfied, before the iterator ends.
          if (pending) yield pending;
          pending = chunk;
        }
        if (size !== input.sizeBytes || hash.digest("hex") !== input.checksum) {
          rejected = "checksum_mismatch";
          throw new Error("Upload does not match admission");
        }
        verifiedComplete = true;
        if (pending) yield pending;
      })();
      try {
        if (input.sizeBytes === 0) await verified.next();
        await objects.put(`${key}.data`, verified, input.sizeBytes);
        if (!verifiedComplete)
          throw new Error("Storage did not consume the complete upload");
        await writeReference(objects, `${key}.staging`, {
          blobId: key,
          sizeBytes: input.sizeBytes,
          checksum: input.checksum,
        });
        return { status: "staged" };
      } catch (error) {
        await removeObjects(objects, key).catch((cleanupError) => {
          logger.warn("Failed to clean up rejected upload", {
            error: cleanupError,
            storageKey: key,
          });
        });
        if (rejected) return { status: "rejected", code: rejected };
        throw error;
      } finally {
        await verified.return(undefined);
      }
    },
    async finalize(blobId) {
      const key = blobIdSchema.parse(blobId);
      const reference = await readReference(objects, `${key}.staging`, key);
      if (!reference) return null;
      await writeReference(objects, `${key}.ready`, reference);
      await objects.delete(`${key}.staging`);
      return reference;
    },
    async read(blobId) {
      const key = blobIdSchema.parse(blobId);
      if (!(await readReference(objects, `${key}.ready`, key))) return null;
      return objects.read(`${key}.data`);
    },
    async delete(blobId) {
      await removeObjects(objects, blobIdSchema.parse(blobId));
    },
  };
}

async function writeReference(
  objects: ObjectStorage,
  key: string,
  reference: BlobReference,
) {
  const bytes = Buffer.from(JSON.stringify(reference));
  await objects.put(
    key,
    (async function* () {
      yield bytes;
    })(),
    bytes.byteLength,
  );
}

async function readReference(
  objects: ObjectStorage,
  path: string,
  blobId: string,
): Promise<BlobReference | null> {
  const source = await objects.read(path);
  if (!source) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of source) {
    size += chunk.byteLength;
    if (size > 1024) throw new Error("Invalid upload publication record");
    chunks.push(chunk);
  }
  const reference = JSON.parse(
    Buffer.concat(chunks).toString("utf8"),
  ) as BlobReference;
  if (
    reference.blobId !== blobId ||
    !isAdmissibleBlobSize(reference.sizeBytes) ||
    typeof reference.checksum !== "string"
  ) {
    throw new Error("Invalid upload publication record");
  }
  return reference;
}

async function removeObjects(objects: ObjectStorage, key: string) {
  const results = await Promise.allSettled(
    [".ready", ".staging", ".data"].map((suffix) =>
      objects.delete(`${key}${suffix}`),
    ),
  );
  const failed = results.find(
    (result): result is PromiseRejectedResult => result.status === "rejected",
  );
  if (failed) throw failed.reason;
}
