import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createFileBlobStore } from "./blob-store";

describe("file blob store", () => {
  it("stages, finalizes, and refuses a checksum mismatch", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-blobs-"));
    const store = createFileBlobStore(directory);
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const staged = await store.stage({
      blobId: "b1",
      bytes: (async function* () {
        yield bytes;
      })(),
      checksum,
      sizeBytes: 4,
    });
    expect(staged).toEqual({ status: "staged" });
    const mismatch = await store.stage({
      blobId: "b2",
      bytes: (async function* () {
        yield bytes;
      })(),
      checksum: "deadbeef",
      sizeBytes: 4,
    });
    expect(mismatch).toEqual({ status: "rejected", code: "checksum_mismatch" });
    const finalized = await store.finalize("b1");
    expect(finalized).toMatchObject({ blobId: "b1", sizeBytes: 4, checksum });
    const read = await store.read("b1");
    const chunks: Uint8Array[] = [];
    if (read) {
      for await (const chunk of read) chunks.push(chunk);
    }
    expect(Buffer.concat(chunks)).toEqual(Buffer.from(bytes));
    await store.delete("b1");
    expect(await store.read("b1")).toBeNull();
    await rm(directory, { recursive: true, force: true });
  });
});
