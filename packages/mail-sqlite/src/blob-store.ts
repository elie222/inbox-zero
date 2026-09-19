import {
  mkdir,
  open,
  readdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { resolve, sep } from "node:path";
import { createHash } from "node:crypto";
import { blobIdSchema } from "@inboxzero/mail-core/identities";
import type { BlobStore } from "@inboxzero/mail-core/ports/blob-store";

export function createFileBlobStore(
  directory: string,
  options: {
    writeFile?: (path: string, bytes: Uint8Array) => Promise<void>;
  } = {},
): BlobStore {
  const writeBytes = options.writeFile ?? writeFile;
  return {
    async stage(input) {
      const stagingPath = blobFile(directory, input.blobId, ".staging");
      await mkdir(directory, { recursive: true });
      const chunks: Uint8Array[] = [];
      let size = 0;
      for await (const chunk of input.bytes) {
        chunks.push(chunk);
        size += chunk.byteLength;
        if (size > input.sizeBytes) {
          return { status: "rejected", code: "too_large" };
        }
      }
      const bytes = Buffer.concat(chunks);
      const checksum = createHash("sha256").update(bytes).digest("hex");
      if (checksum !== input.checksum) {
        return { status: "rejected", code: "checksum_mismatch" };
      }
      try {
        await writeBytes(stagingPath, bytes);
      } catch (error) {
        if (isDiskFullError(error)) {
          await rm(stagingPath, { force: true });
          return { status: "rejected", code: "too_large" };
        }
        throw error;
      }
      return { status: "staged" };
    },
    async finalize(blobId) {
      const staged = blobFile(directory, blobId, ".staging");
      const finalPath = blobFile(directory, blobId);
      try {
        const bytes = await readFile(staged);
        await writeBytes(finalPath, bytes);
        await rm(staged, { force: true });
        return {
          blobId,
          sizeBytes: bytes.byteLength,
          checksum: createHash("sha256").update(bytes).digest("hex"),
        };
      } catch {
        return null;
      }
    },
    async read(blobId) {
      const path = blobFile(directory, blobId);
      try {
        const bytes = await readFile(path);
        return (async function* () {
          yield new Uint8Array(bytes);
        })();
      } catch {
        return null;
      }
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
export const BLOB_GATE_STALE_MS = 200;

export async function holdBlob(directory: string, blobId: string) {
  // Holds are not refcounted; attachment ids must be unique per in-flight send.
  await withBlobGate(directory, blobId, async () => {
    await writeFile(blobFile(directory, blobId, ".hold"), "");
  });
}

export async function releaseBlobHold(directory: string, blobId: string) {
  await rm(blobFile(directory, blobId, ".hold"), { force: true });
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
  let blobId = name;
  if (name.endsWith(".meta.json")) {
    blobId = name.slice(0, -".meta.json".length);
  } else if (name.endsWith(".staging")) {
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
  const startedMs = Date.now();
  const deadlineMs = startedMs + BLOB_GATE_STALE_MS + 500;
  while (Date.now() < deadlineMs) {
    try {
      const handle = await open(gate, "wx");
      try {
        return await fn();
      } finally {
        await handle.close().catch(() => undefined);
        await rm(gate, { force: true });
      }
    } catch (error) {
      if (!isExistError(error)) throw error;
      let stale = Date.now() - startedMs >= BLOB_GATE_STALE_MS;
      try {
        const info = await stat(gate);
        stale = stale || Date.now() - info.mtimeMs >= BLOB_GATE_STALE_MS;
      } catch {
        // The other holder released the gate before this retry.
      }
      if (stale) await rm(gate, { force: true });
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }
  throw new Error("blob gate timeout");
}

function isExistError(error: unknown) {
  return Boolean(
    error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "EEXIST",
  );
}
