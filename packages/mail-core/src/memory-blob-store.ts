import {
  type BlobStore,
  collectBlobBytes,
  isAdmissibleBlobSize,
} from "./ports/blob-store";

export function createMemoryBlobStore(): BlobStore {
  const files = new Map<string, { bytes: Uint8Array; checksum: string }>();
  return {
    async stage(input) {
      if (!isAdmissibleBlobSize(input.sizeBytes)) {
        return { status: "rejected", code: "too_large" };
      }
      const collected = await collectBlobBytes(input.bytes, input.sizeBytes);
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
