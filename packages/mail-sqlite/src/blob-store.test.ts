import {
  mkdir,
  mkdtemp,
  readdir,
  readFile,
  rename,
  rm,
  utimes,
  writeFile,
} from "node:fs/promises";
import { hostname, tmpdir } from "node:os";
import { join } from "node:path";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  BLOB_HOLD_TTL_MS,
  collectUnreferencedBlobs,
  createFileBlobStore,
  deleteUnheldBlob,
  hasFinalizedBlob,
  holdBlob,
  isBlobHeld,
  readBlobMetadata,
  writeBlobMetadata,
} from "./blob-store";

describe("file blob store", () => {
  it("writes chunks before asking for more bytes and removes failed staging", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-blobs-"));
    try {
      const store = createFileBlobStore(directory);
      await expect(
        store.stage({
          blobId: "streamed",
          checksum: "unused",
          sizeBytes: 10,
          bytes: (async function* () {
            yield new Uint8Array([1, 2, 3]);
            const files = await readdir(directory);
            expect(files).toHaveLength(1);
            expect(await readFile(join(directory, files[0]!))).toEqual(
              Buffer.from([1, 2, 3]),
            );
            throw new Error("upload interrupted");
          })(),
        }),
      ).rejects.toThrow("upload interrupted");
      expect(await readdir(directory)).toEqual([]);
      expect(await store.finalize("streamed")).toBeNull();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("rejects a truncated upload even when its checksum matches the short bytes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-blobs-"));
    try {
      const store = createFileBlobStore(directory);
      const bytes = new Uint8Array([1, 2]);
      expect(
        await store.stage({
          blobId: "truncated",
          sizeBytes: 3,
          checksum: createHash("sha256").update(bytes).digest("hex"),
          bytes: (async function* () {
            yield bytes;
          })(),
        }),
      ).toEqual({ status: "rejected", code: "checksum_mismatch" });
      expect(await store.finalize("truncated")).toBeNull();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

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

  it("reports a finalized blob without reading its bytes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-blobs-"));
    const store = createFileBlobStore(directory);
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const checksum = createHash("sha256").update(bytes).digest("hex");
    await store.stage({
      blobId: "b1",
      bytes: (async function* () {
        yield bytes;
      })(),
      checksum,
      sizeBytes: 4,
    });
    await expect(hasFinalizedBlob(directory, "b1")).resolves.toBe(false);
    await store.finalize("b1");
    await expect(hasFinalizedBlob(directory, "b1")).resolves.toBe(true);
    await store.delete("b1");
    await expect(hasFinalizedBlob(directory, "b1")).resolves.toBe(false);
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
      openFile: async () => {
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

  it("does not steal a live gate while another process owns it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-blobs-"));
    try {
      const store = createFileBlobStore(directory);
      await writeBlob(store, "live-gate");
      await writeGateOwner(directory, "live-gate", process.pid);
      const releaseAtMs = Date.now() + 350;
      const release = new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          const gate = join(directory, "live-gate.gate");
          const releasedGate = join(directory, "live-gate.released-gate");
          rename(gate, releasedGate)
            .then(() =>
              rm(releasedGate, {
                recursive: true,
                force: true,
              }),
            )
            .then(resolve, reject);
        }, 350);
      });

      const deletion = deleteUnheldBlob(directory, "live-gate");
      await expect(
        Promise.race([deletion, delay(120).then(() => "still-waiting")]),
      ).resolves.toBe("still-waiting");
      expect(await store.read("live-gate")).not.toBeNull();

      await release;
      await expect(deletion).resolves.toBe("deleted");
      expect(Date.now()).toBeGreaterThanOrEqual(releaseAtMs - 25);
      expect(await store.read("live-gate")).toBeNull();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("reaps a gate only when its owner process is gone", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-blobs-"));
    try {
      const store = createFileBlobStore(directory);
      await writeBlob(store, "dead-gate");
      await writeGateOwner(directory, "dead-gate", unusedPid());
      await expect(holdBlob(directory, "dead-gate")).resolves.toBe("held");
      expect(await isBlobHeld(directory, "dead-gate")).toBe(true);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("waits behind a live recovery gate instead of deleting it", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-blobs-"));
    try {
      const store = createFileBlobStore(directory);
      await writeBlob(store, "live-recovery-gate");
      await writeGateOwner(directory, "live-recovery-gate", unusedPid());
      await writeGateOwner(
        directory,
        "live-recovery-gate",
        process.pid,
        ".gate-recovery",
      );
      const release = new Promise<void>((resolve, reject) => {
        setTimeout(() => {
          const gate = join(directory, "live-recovery-gate.gate-recovery");
          const releasedGate = join(
            directory,
            "live-recovery-gate.released-gate-recovery",
          );
          rename(gate, releasedGate)
            .then(() => rm(releasedGate, { recursive: true, force: true }))
            .then(resolve, reject);
        }, 150);
      });

      const hold = holdBlob(directory, "live-recovery-gate");
      await expect(
        Promise.race([hold, delay(60).then(() => "still-waiting")]),
      ).resolves.toBe("still-waiting");
      expect(
        await readdir(join(directory, "live-recovery-gate.gate-recovery")),
      ).toEqual(["owner.json"]);

      await release;
      await expect(hold).resolves.toBe("held");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("fails explicitly instead of deleting an abandoned recovery gate", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-blobs-"));
    try {
      const store = createFileBlobStore(directory);
      await writeBlob(store, "abandoned-recovery-gate");
      await writeGateOwner(directory, "abandoned-recovery-gate", unusedPid());
      await writeGateOwner(
        directory,
        "abandoned-recovery-gate",
        unusedPid(),
        ".gate-recovery",
      );

      await expect(
        holdBlob(directory, "abandoned-recovery-gate"),
      ).rejects.toThrow("blob recovery gate abandoned");
      expect(
        await readdir(join(directory, "abandoned-recovery-gate.gate")),
      ).toEqual(["owner.json"]);
      expect(
        await readdir(join(directory, "abandoned-recovery-gate.gate-recovery")),
      ).toEqual(["owner.json"]);
      expect(await store.read("abandoned-recovery-gate")).not.toBeNull();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("does not treat finalize claim files as collectable blob ids", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-blobs-"));
    try {
      const claimName = "upload-1.123e4567-e89b-12d3-a456-426614174000.staging";
      await writeFile(join(directory, claimName), "partial");
      const old = new Date(Date.now() - 10_000);
      await utimes(join(directory, claimName), old, old);
      const collected = await collectUnreferencedBlobs({
        directory,
        referencedIds: [],
        nowMs: Date.now(),
        graceMs: 1000,
      });
      expect(collected.deleted).toEqual([]);
      expect(await readFile(join(directory, claimName), "utf8")).toBe(
        "partial",
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("does not write a hold sidecar when the blob is missing", async () => {
    const directory = await mkdtemp(join(tmpdir(), "mail-blobs-"));
    await expect(holdBlob(directory, "missing")).resolves.toBe("missing");
    expect(await isBlobHeld(directory, "missing")).toBe(false);
    await rm(directory, { recursive: true, force: true });
  });
});

async function writeBlob(
  store: ReturnType<typeof createFileBlobStore>,
  blobId: string,
) {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const checksum = createHash("sha256").update(bytes).digest("hex");
  expect(
    await store.stage({
      blobId,
      bytes: (async function* () {
        yield bytes;
      })(),
      checksum,
      sizeBytes: 4,
    }),
  ).toEqual({ status: "staged" });
  expect(await store.finalize(blobId)).toMatchObject({ blobId });
}

async function writeGateOwner(
  directory: string,
  blobId: string,
  pid: number,
  suffix = ".gate",
) {
  const gate = join(directory, `${blobId}${suffix}`);
  await mkdir(gate, { recursive: true });
  await writeFile(
    join(gate, "owner.json"),
    JSON.stringify({
      hostname: hostname(),
      pid,
      processStartedAtMs:
        pid === process.pid ? currentProcessStartedAtMs() : Date.now(),
    }),
  );
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function unusedPid() {
  for (let pid = 999_999; pid >= 999_900; pid -= 1) {
    try {
      process.kill(pid, 0);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ESRCH"
      ) {
        return pid;
      }
    }
  }
  return -1;
}

function currentProcessStartedAtMs() {
  return Math.round(Date.now() - process.uptime() * 1000);
}
