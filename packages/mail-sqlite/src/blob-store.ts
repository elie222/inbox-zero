import {
  type FileHandle,
  mkdir,
  open,
  readdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createReadStream } from "node:fs";
import { hostname } from "node:os";
import { resolve, sep } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { blobIdSchema } from "@inboxzero/mail-core/identities";
import type { BlobStore } from "@inboxzero/mail-core/ports/blob-store";

const HOSTNAME = hostname();
const PROCESS_STARTED_AT_MS = Math.round(Date.now() - process.uptime() * 1000);

export function createFileBlobStore(
  directory: string,
  options: {
    openFile?: (path: string, flags: "wx") => Promise<FileHandle>;
  } = {},
): BlobStore {
  const openFile = options.openFile ?? open;
  return {
    async stage(input) {
      const stagingPath = blobFile(directory, input.blobId, ".staging");
      if (
        !Number.isSafeInteger(input.sizeBytes) ||
        input.sizeBytes < 0 ||
        input.sizeBytes > 25_000_000
      ) {
        return { status: "rejected", code: "too_large" };
      }
      const temporaryPath = blobFile(
        directory,
        input.blobId,
        `.${randomUUID()}.staging`,
      );
      let handle: FileHandle | undefined;
      try {
        await mkdir(directory, { recursive: true });
        handle = await openFile(temporaryPath, "wx");
        const hash = createHash("sha256");
        let size = 0;
        for await (const chunk of input.bytes) {
          size += chunk.byteLength;
          if (size > input.sizeBytes)
            return { status: "rejected", code: "too_large" };
          hash.update(chunk);
          let offset = 0;
          while (offset < chunk.byteLength) {
            const { bytesWritten } = await handle.write(
              chunk,
              offset,
              chunk.byteLength - offset,
            );
            if (bytesWritten === 0)
              throw new Error("Blob write made no progress");
            offset += bytesWritten;
          }
        }
        if (size !== input.sizeBytes || hash.digest("hex") !== input.checksum) {
          return { status: "rejected", code: "checksum_mismatch" };
        }
        await handle.sync();
        await handle.close();
        handle = undefined;
        await withBlobGate(directory, input.blobId, () =>
          rename(temporaryPath, stagingPath),
        );
        return { status: "staged" };
      } catch (error) {
        if (isDiskFullError(error))
          return { status: "rejected", code: "too_large" };
        throw error;
      } finally {
        await handle?.close();
        await rm(temporaryPath, { force: true });
      }
    },
    async finalize(blobId) {
      return withBlobGate(directory, blobId, async () => {
        const staged = blobFile(directory, blobId, ".staging");
        try {
          const hash = createHash("sha256");
          let sizeBytes = 0;
          for await (const chunk of createReadStream(staged)) {
            hash.update(chunk);
            sizeBytes += chunk.byteLength;
          }
          await rename(staged, blobFile(directory, blobId));
          return { blobId, sizeBytes, checksum: hash.digest("hex") };
        } catch (error) {
          if (isMissingFileError(error)) return null;
          throw error;
        }
      });
    },
    async read(blobId) {
      const path = blobFile(directory, blobId);
      try {
        await stat(path);
      } catch (error) {
        if (isMissingFileError(error)) return null;
        throw error;
      }
      return (async function* () {
        for await (const chunk of createReadStream(path))
          yield new Uint8Array(chunk);
      })();
    },
    async delete(blobId) {
      await rm(blobFile(directory, blobId), { force: true });
      await rm(blobFile(directory, blobId, ".staging"), { force: true });
      await rm(blobFile(directory, blobId, ".meta.json"), { force: true });
      await rm(blobFile(directory, blobId, ".hold"), { force: true });
    },
  };
}

export async function collectUnreferencedBlobs(input: {
  directory: string;
  referencedIds: Iterable<string>;
  nowMs: number;
  graceMs: number;
}): Promise<{ deleted: string[] }> {
  const referenced = new Set(input.referencedIds);
  let names: string[];
  try {
    names = await readdir(input.directory);
  } catch {
    return { deleted: [] };
  }
  const blobIds = new Set<string>();
  for (const name of names) {
    const blobId = blobIdFromFileName(name);
    if (blobId) blobIds.add(blobId);
  }
  const deleted: string[] = [];
  for (const blobId of blobIds) {
    if (referenced.has(blobId)) continue;
    const newestMs = await blobNewestMtimeMs(input.directory, blobId);
    if (newestMs == null || input.nowMs - newestMs < input.graceMs) continue;
    if ((await deleteUnheldBlob(input.directory, blobId)) === "deleted") {
      deleted.push(blobId);
    }
  }
  return { deleted };
}

export const BLOB_HOLD_TTL_MS = 60 * 60 * 1000;
export const BLOB_GATE_WAIT_TIMEOUT_MS = 30_000;
const BLOB_GATE_RETRY_MS = 10;

export async function holdBlob(directory: string, blobId: string) {
  // Holds are not refcounted; attachment ids must be unique per in-flight send.
  return withBlobGate(directory, blobId, async () => {
    try {
      await stat(blobFile(directory, blobId));
    } catch {
      return "missing" as const;
    }
    await writeFile(blobFile(directory, blobId, ".hold"), "");
    return "held" as const;
  });
}

export async function releaseBlobHold(directory: string, blobId: string) {
  await withBlobGate(directory, blobId, async () => {
    await rm(blobFile(directory, blobId, ".hold"), { force: true });
  });
}

export async function isBlobHeld(directory: string, blobId: string) {
  const path = blobFile(directory, blobId, ".hold");
  try {
    const info = await stat(path);
    if (Date.now() - info.mtimeMs > BLOB_HOLD_TTL_MS) {
      await rm(path, { force: true });
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export async function hasFinalizedBlob(directory: string, blobId: string) {
  try {
    await stat(blobFile(directory, blobId));
    return true;
  } catch {
    return false;
  }
}

export async function deleteUnheldBlob(directory: string, blobId: string) {
  return withBlobGate(directory, blobId, async () => {
    if (await isBlobHeld(directory, blobId)) return "in_use" as const;
    await createFileBlobStore(directory).delete(blobId);
    return "deleted" as const;
  });
}

export async function writeBlobMetadata(
  directory: string,
  blobId: string,
  metadata: {
    filename: string;
    contentType: string;
    checksum?: string;
    sizeBytes?: number;
  },
) {
  await mkdir(directory, { recursive: true });
  await writeFile(
    blobFile(directory, blobId, ".meta.json"),
    JSON.stringify(metadata),
  );
}

export async function readBlobMetadata(
  directory: string,
  blobId: string,
): Promise<{
  filename: string;
  contentType: string;
  checksum?: string;
  sizeBytes?: number;
} | null> {
  const path = blobFile(directory, blobId, ".meta.json");
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as {
      filename?: string;
      contentType?: string;
      checksum?: string;
      sizeBytes?: number;
    };
    return {
      filename: parsed.filename ?? blobId,
      contentType: parsed.contentType ?? "application/octet-stream",
      ...(typeof parsed.checksum === "string" &&
      parsed.checksum.length >= 1 &&
      parsed.checksum.length <= 128
        ? { checksum: parsed.checksum }
        : {}),
      ...(typeof parsed.sizeBytes === "number" &&
      Number.isInteger(parsed.sizeBytes) &&
      parsed.sizeBytes >= 0 &&
      parsed.sizeBytes <= 25_000_000
        ? { sizeBytes: parsed.sizeBytes }
        : {}),
    };
  } catch {
    return null;
  }
}

function isDiskFullError(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("code" in error)) return false;
  return error.code === "ENOSPC" || error.code === "EDQUOT";
}

function blobFile(directory: string, blobId: string, suffix = "") {
  const parsed = blobIdSchema.safeParse(blobId);
  if (!parsed.success) throw new Error("invalid blob id");
  const root = resolve(directory);
  const path = resolve(root, `${parsed.data}${suffix}`);
  if (path !== root && !path.startsWith(`${root}${sep}`)) {
    throw new Error("invalid blob id");
  }
  return path;
}

function blobIdFromFileName(name: string) {
  if (
    name.endsWith(".gate-recovery") ||
    /\.[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.claim$/i.test(
      name,
    )
  ) {
    return null;
  }
  let blobId = name;
  if (name.endsWith(".meta.json")) {
    blobId = name.slice(0, -".meta.json".length);
  } else if (name.endsWith(".staging")) {
    if (
      /\.[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.staging$/i.test(
        name,
      )
    ) {
      return null;
    }
    blobId = name.slice(0, -".staging".length);
  } else if (name.endsWith(".hold")) {
    blobId = name.slice(0, -".hold".length);
  } else if (name.endsWith(".gate")) {
    blobId = name.slice(0, -".gate".length);
  }
  return blobIdSchema.safeParse(blobId).success ? blobId : null;
}

async function blobNewestMtimeMs(directory: string, blobId: string) {
  let newestMs: number | null = null;
  for (const suffix of ["", ".staging", ".meta.json", ".hold"]) {
    try {
      const info = await stat(blobFile(directory, blobId, suffix));
      if (newestMs == null || info.mtimeMs > newestMs) newestMs = info.mtimeMs;
    } catch {
      // Missing sibling files are expected for staging-only or finalized blobs.
    }
  }
  return newestMs;
}

async function withBlobGate<T>(
  directory: string,
  blobId: string,
  fn: () => Promise<T>,
): Promise<T> {
  await mkdir(directory, { recursive: true });
  const gate = blobFile(directory, blobId, ".gate");
  const recoveryGate = blobFile(directory, blobId, ".gate-recovery");
  const deadlineMs = Date.now() + BLOB_GATE_WAIT_TIMEOUT_MS;
  while (Date.now() < deadlineMs) {
    const claim = await tryAcquireOwnedLock(gate);
    if (claim) {
      try {
        return await fn();
      } finally {
        await releaseOwnedLock(claim);
      }
    }
    await recoverDeadOwnedLock(gate, recoveryGate);
    await new Promise((resolve) => setTimeout(resolve, BLOB_GATE_RETRY_MS));
  }
  throw new Error("blob gate timeout");
}

type OwnedLockClaim = {
  path: string;
};

type OwnedLockOwner = {
  hostname: string;
  pid: number;
  processStartedAtMs: number;
};

async function tryAcquireOwnedLock(
  path: string,
): Promise<OwnedLockClaim | null> {
  const claimPath = `${path}.${randomUUID()}.claim`;
  try {
    await mkdir(claimPath);
    await writeFile(
      ownedLockOwnerPath(claimPath),
      JSON.stringify(currentOwner()),
      "utf8",
    );
    await rename(claimPath, path);
    return { path };
  } catch (error) {
    await rm(claimPath, { recursive: true, force: true });
    if (isDestinationExistsError(error)) return null;
    throw error;
  }
}

async function recoverDeadOwnedLock(path: string, recoveryPath: string) {
  if (!(await ownedLockIsRecoverable(path))) return;
  const recovery = await tryAcquireOwnedLock(recoveryPath);
  if (!recovery) {
    if (await ownedLockIsRecoverable(recoveryPath)) {
      throw new Error("blob recovery gate abandoned");
    }
    return;
  }
  try {
    if (await ownedLockIsRecoverable(path)) {
      await rm(path, { recursive: true, force: true });
    }
  } finally {
    await releaseOwnedLock(recovery);
  }
}

async function releaseOwnedLock(claim: OwnedLockClaim) {
  await rm(claim.path, { recursive: true, force: true });
}

async function ownedLockIsRecoverable(path: string) {
  const owner = await readOwnedLockOwner(path);
  if (!owner) return false;
  if (owner.hostname !== HOSTNAME) return false;
  if (!Number.isInteger(owner.pid) || owner.pid <= 0) return true;
  if (
    owner.pid === process.pid &&
    Math.abs(owner.processStartedAtMs - PROCESS_STARTED_AT_MS) > 1000
  ) {
    return true;
  }
  return !processIsAlive(owner.pid);
}

async function readOwnedLockOwner(
  path: string,
): Promise<OwnedLockOwner | null> {
  try {
    const info = await stat(path);
    if (!info.isDirectory()) return null;
    const parsed = JSON.parse(
      await readFile(ownedLockOwnerPath(path), "utf8"),
    ) as Partial<OwnedLockOwner>;
    if (
      typeof parsed.hostname !== "string" ||
      typeof parsed.pid !== "number" ||
      typeof parsed.processStartedAtMs !== "number"
    ) {
      return null;
    }
    return parsed as OwnedLockOwner;
  } catch {
    return null;
  }
}

function currentOwner(): OwnedLockOwner {
  return {
    hostname: HOSTNAME,
    pid: process.pid,
    processStartedAtMs: PROCESS_STARTED_AT_MS,
  };
}

function ownedLockOwnerPath(path: string) {
  return resolve(path, "owner.json");
}

function processIsAlive(pid: number) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ESRCH"
    ) {
      return false;
    }
    return true;
  }
}

function isDestinationExistsError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      (error.code === "EEXIST" ||
        error.code === "ENOTEMPTY" ||
        error.code === "EISDIR"),
  );
}

function isMissingFileError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "ENOENT",
  );
}
