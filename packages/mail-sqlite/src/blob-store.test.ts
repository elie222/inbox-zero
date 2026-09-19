import { mkdtemp, rm, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  BLOB_GATE_STALE_MS,
  BLOB_HOLD_TTL_MS,
  collectUnreferencedBlobs,
  createFileBlobStore,
  holdBlob,
  isBlobHeld,
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
    await writeBlobMetadata(directory, "invoice", {
      filename: "invoice.pdf",
      contentType: "application/pdf",
      checksum: "ok",
      sizeBytes: 99_000_000,
    });
    expect(await readBlobMetadata(directory, "invoice")).toEqual({
      filename: "invoice.pdf",
      contentType: "application/pdf",
      checksum: "ok",
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

  it("deletes old unreferenced blobs and keeps live and fresh ones", async () => {
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
    for (const blobId of ["orphan-old", "orphan-fresh", "keep-draft"]) {
      expect(await store.stage({ blobId, ...bytesFor() })).toEqual({
        status: "staged",
      });
      expect(await store.finalize(blobId)).toMatchObject({ blobId });
    }
    const nowMs = Date.now();
    await utimes(
      join(directory, "orphan-old"),
      new Date(nowMs - 10_000),
      new Date(nowMs - 10_000),
    );
    await utimes(
      join(directory, "keep-draft"),
      new Date(nowMs - 10_000),
      new Date(nowMs - 10_000),
    );
    const collected = await collectUnreferencedBlobs({
      directory,
      referencedIds: ["keep-draft"],
      nowMs,
      graceMs: 1000,
    });
    expect(collected.deleted.sort()).toEqual(["orphan-old"]);
    expect(await store.read("orphan-old")).toBeNull();
    expect(await store.read("orphan-fresh")).not.toBeNull();
    expect(await store.read("keep-draft")).not.toBeNull();
    await rm(directory, { recursive: true, force: true });
  });

  it("refuses to garbage-collect a held blob and delete clears the hold", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-blobs-"));
    const store = createFileBlobStore(directory);
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const checksum = createHash("sha256").update(bytes).digest("hex");
    expect(
      await store.stage({
        blobId: "held-old",
        bytes: (async function* () {
          yield bytes;
        })(),
        checksum,
        sizeBytes: 4,
      }),
    ).toEqual({ status: "staged" });
    expect(await store.finalize("held-old")).toMatchObject({
      blobId: "held-old",
    });
    await holdBlob(directory, "held-old");
    expect(await isBlobHeld(directory, "held-old")).toBe(true);
    const nowMs = Date.now();
    await utimes(
      join(directory, "held-old"),
      new Date(nowMs - 10_000),
      new Date(nowMs - 10_000),
    );
    const collected = await collectUnreferencedBlobs({
      directory,
      referencedIds: [],
      nowMs,
      graceMs: 1000,
    });
    expect(collected.deleted).toEqual([]);
    expect(await store.read("held-old")).not.toBeNull();
    await store.delete("held-old");
    expect(await store.read("held-old")).toBeNull();
    expect(await isBlobHeld(directory, "held-old")).toBe(false);
    await rm(directory, { recursive: true, force: true });
  });

  it("expires a stale hold so garbage collection can delete the blob", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-blobs-"));
    const store = createFileBlobStore(directory);
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const checksum = createHash("sha256").update(bytes).digest("hex");
    expect(
      await store.stage({
        blobId: "stale-hold",
        bytes: (async function* () {
          yield bytes;
        })(),
        checksum,
        sizeBytes: 4,
      }),
    ).toEqual({ status: "staged" });
    expect(await store.finalize("stale-hold")).toMatchObject({
      blobId: "stale-hold",
    });
    await holdBlob(directory, "stale-hold");
    const nowMs = Date.now();
    const stale = new Date(nowMs - BLOB_HOLD_TTL_MS - 1000);
    await utimes(join(directory, "stale-hold"), stale, stale);
    await utimes(join(directory, "stale-hold.hold"), stale, stale);
    const collected = await collectUnreferencedBlobs({
      directory,
      referencedIds: [],
      nowMs,
      graceMs: 1000,
    });
    expect(collected.deleted).toEqual(["stale-hold"]);
    expect(await store.read("stale-hold")).toBeNull();
    expect(await isBlobHeld(directory, "stale-hold")).toBe(false);
    await rm(directory, { recursive: true, force: true });
  });

  it("reaps a leftover gate so a later hold can proceed", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-blobs-"));
    await writeFile(join(directory, "gated.gate"), "");
    const stale = new Date(Date.now() - BLOB_GATE_STALE_MS - 50);
    await utimes(join(directory, "gated.gate"), stale, stale);
    await holdBlob(directory, "gated");
    expect(await isBlobHeld(directory, "gated")).toBe(true);
    await rm(directory, { recursive: true, force: true });
  });
});
