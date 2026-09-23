import { describe, expect, it } from "vitest";
import { createBlobStore, type BlobFileSystem } from "./blob-store";
import { sha256Fallback } from "./sha256";

describe("expo blob store", () => {
  it("stages, finalizes, and refuses to delete a held blob", async () => {
    let now = 1000;
    const files = memoryFiles(() => now);
    const store = createBlobStore({
      files,
      sha256: async (bytes) => sha256Fallback(bytes),
      nowMs: () => now,
      randomId: () => "temp",
    });
    const bytes = new TextEncoder().encode("hello");
    const checksum = [...sha256Fallback(bytes)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
    const staged = await store.stage({
      blobId: "blob1",
      bytes: (async function* () {
        yield bytes;
      })(),
      checksum,
      sizeBytes: bytes.byteLength,
    });
    expect(staged).toEqual({ status: "staged" });
    const finalized = await store.finalize("blob1");
    expect(finalized).toMatchObject({
      blobId: "blob1",
      sizeBytes: 5,
      checksum,
    });
    expect(await store.hold("blob1")).toBe("held");
    now += 1000;
    const kept = await store.collectUnreferenced({
      referencedIds: [],
      graceMs: 0,
    });
    expect(kept.deleted).toEqual([]);
    await store.releaseHold("blob1");
    now += 1000;
    const deleted = await store.collectUnreferenced({
      referencedIds: [],
      graceMs: 0,
    });
    expect(deleted.deleted).toEqual(["blob1"]);
    expect(await store.read("blob1")).toBeNull();
  });

  it("rejects a checksum mismatch without leaving a staged file", async () => {
    const files = memoryFiles();
    const store = createBlobStore({
      files,
      sha256: async (bytes) => sha256Fallback(bytes),
    });
    const bytes = new Uint8Array([1, 2, 3]);
    const result = await store.stage({
      blobId: "blob2",
      bytes: (async function* () {
        yield bytes;
      })(),
      checksum: "ab".repeat(32),
      sizeBytes: bytes.byteLength,
    });
    expect(result).toEqual({ status: "rejected", code: "checksum_mismatch" });
    expect(await files.list()).toEqual([]);
  });
});

function memoryFiles(nowMs: () => number = Date.now): BlobFileSystem {
  const entries = new Map<string, { bytes: Uint8Array; mtimeMs: number }>();
  return {
    async writeNew(name, bytes) {
      if (entries.has(name)) return "exists";
      entries.set(name, { bytes: new Uint8Array(bytes), mtimeMs: nowMs() });
      return "created";
    },
    async read(name) {
      const entry = entries.get(name);
      return entry ? new Uint8Array(entry.bytes) : null;
    },
    async rename(from, to) {
      const entry = entries.get(from);
      if (!entry) throw new Error("missing file");
      entries.delete(from);
      entries.set(to, { ...entry, mtimeMs: nowMs() });
    },
    async remove(name) {
      entries.delete(name);
    },
    async list() {
      return [...entries.keys()];
    },
    async mtimeMs(name) {
      return entries.get(name)?.mtimeMs ?? null;
    },
  };
}
