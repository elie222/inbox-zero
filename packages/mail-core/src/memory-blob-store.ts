import type { BlobStore } from "./ports/blob-store";

export function createMemoryBlobStore(): BlobStore {
  const files = new Map<string, { bytes: Uint8Array; checksum: string }>();
  return {
    async stage(input) {
      if (
        !Number.isSafeInteger(input.sizeBytes) ||
        input.sizeBytes < 0 ||
        input.sizeBytes > 25_000_000
      ) {
        return { status: "rejected", code: "too_large" };
      }
      const collected = await collectBytes(input.bytes, input.sizeBytes);
      if (collected.status === "too_large") {
        return { status: "rejected", code: "too_large" };
      }
      if (collected.bytes.byteLength !== input.sizeBytes) {
        return { status: "rejected", code: "checksum_mismatch" };
      }
      files.set(input.blobId, {
        bytes: collected.bytes,
        checksum: input.checksum,
      });
      return { status: "staged" };
    },
    async finalize(blobId) {
      const file = files.get(blobId);
      if (!file) return null;
      return {
        blobId,
        sizeBytes: file.bytes.byteLength,
        checksum: file.checksum,
      };
    },
    async read(blobId) {
      const file = files.get(blobId);
      if (!file) return null;
      return (async function* () {
        yield file.bytes;
      })();
    },
    async delete(blobId) {
      files.delete(blobId);
    },
  };
}

async function collectBytes(bytes: AsyncIterable<Uint8Array>, max: number) {
  const chunks: Uint8Array[] = [];
  let size = 0;
  for await (const chunk of bytes) {
    size += chunk.byteLength;
    if (size > max) return { status: "too_large" as const };
    chunks.push(chunk);
  }
  const collected = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    collected.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return { status: "ok" as const, bytes: collected };
}
