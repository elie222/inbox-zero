import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  createFileBlobStore,
  readBlobMetadata,
  writeBlobMetadata,
} from "./blob-store";

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
    expect(await readBlobMetadata(directory, "b1")).toBeNull();
    await rm(directory, { recursive: true, force: true });
  });

  it("persists filename and content type beside the blob bytes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-blobs-"));
    const store = createFileBlobStore(directory);
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const checksum = createHash("sha256").update(bytes).digest("hex");
    await store.stage({
      blobId: "invoice",
      bytes: (async function* () {
        yield bytes;
      })(),
      checksum,
      sizeBytes: 4,
    });
    await store.finalize("invoice");
    await writeBlobMetadata(directory, "invoice", {
      filename: "invoice.pdf",
      contentType: "application/pdf",
    });
    expect(await readBlobMetadata(directory, "invoice")).toEqual({
      filename: "invoice.pdf",
      contentType: "application/pdf",
    });
    await store.delete("invoice");
    expect(await readBlobMetadata(directory, "invoice")).toBeNull();
    await rm(directory, { recursive: true, force: true });
  });

  it("refuses blob ids that would leave the store directory", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-blobs-"));
    const store = createFileBlobStore(directory);
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const checksum = createHash("sha256").update(bytes).digest("hex");
    const bytesFor = () => ({
      bytes: (async function* () {
        yield bytes;
      })(),
      checksum,
      sizeBytes: 4,
    });
    await expect(
      store.stage({ blobId: "../escape", ...bytesFor() }),
    ).rejects.toThrow("invalid blob id");
    await expect(
      store.stage({ blobId: "nested/id", ...bytesFor() }),
    ).rejects.toThrow("invalid blob id");
    await expect(store.read("../escape")).rejects.toThrow("invalid blob id");
    await expect(
      writeBlobMetadata(directory, "../../other-account", {
        filename: "secret.pdf",
        contentType: "application/pdf",
      }),
    ).rejects.toThrow("invalid blob id");
    await rm(directory, { recursive: true, force: true });
  });

  it("rejects staging when the filesystem is full", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-blobs-"));
    const store = createFileBlobStore(directory, {
      writeFile: async () => {
        const error = new Error(
          "no space left on device",
        ) as NodeJS.ErrnoException;
        error.code = "ENOSPC";
        throw error;
      },
    });
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
    expect(staged).toEqual({ status: "rejected", code: "too_large" });
    await rm(directory, { recursive: true, force: true });
  });
});
