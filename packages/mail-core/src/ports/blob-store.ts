export const MAX_BLOB_BYTES = 25_000_000;

export type BlobReference = {
  blobId: string;
  sizeBytes: number;
  checksum: string;
};

export interface BlobStore {
  delete(blobId: string): Promise<void>;
  finalize(blobId: string): Promise<BlobReference | null>;
  read(blobId: string): Promise<AsyncIterable<Uint8Array> | null>;
  stage(input: {
    blobId: string;
    bytes: AsyncIterable<Uint8Array>;
    checksum: string;
    sizeBytes: number;
  }): Promise<
    | { status: "staged" }
    | { status: "rejected"; code: "too_large" | "checksum_mismatch" }
  >;
}

export function isAdmissibleBlobSize(sizeBytes: number) {
  return (
    Number.isSafeInteger(sizeBytes) &&
    sizeBytes >= 0 &&
    sizeBytes <= MAX_BLOB_BYTES
  );
}

export async function collectBlobBytes(
  bytes: AsyncIterable<Uint8Array>,
  sizeBytes: number,
) {
  if (!isAdmissibleBlobSize(sizeBytes)) return { status: "too_large" as const };
  const collected = new Uint8Array(sizeBytes);
  let size = 0;
  for await (const chunk of bytes) {
    if (size + chunk.byteLength > sizeBytes) {
      return { status: "too_large" as const };
    }
    collected.set(chunk, size);
    size += chunk.byteLength;
  }
  return { status: "ok" as const, bytes: collected.subarray(0, size) };
}
