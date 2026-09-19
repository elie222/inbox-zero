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
