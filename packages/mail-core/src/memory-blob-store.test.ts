import { describe, expect, it } from "vitest";
import { createMemoryBlobStore } from "./memory-blob-store";

describe("memory blob store", () => {
  it("round-trips staged bytes and preserves the provided checksum", async () => {
    const store = createMemoryBlobStore();
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const staged = await store.stage({
      blobId: "att-1",
      bytes: (async function* () {
        yield bytes;
      })(),
      checksum: "abc",
      sizeBytes: 4,
    });
    expect(staged).toEqual({ status: "staged" });
    expect(await store.finalize("att-1")).toEqual({
      blobId: "att-1",
      sizeBytes: 4,
      checksum: "abc",
    });
    const stream = await store.read("att-1");
    const chunks: number[] = [];
    if (stream) {
      for await (const chunk of stream) chunks.push(...chunk);
    }
    expect(chunks).toEqual([1, 2, 3, 4]);
  });

  it("rejects a size mismatch without pretending to rehash", async () => {
    const store = createMemoryBlobStore();
    await expect(
      store.stage({
        blobId: "att-2",
        bytes: (async function* () {
          yield new Uint8Array([1]);
        })(),
        checksum: "abc",
        sizeBytes: 4,
      }),
    ).resolves.toEqual({ status: "rejected", code: "checksum_mismatch" });
  });
});
