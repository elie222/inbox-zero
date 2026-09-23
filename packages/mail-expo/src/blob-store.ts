import { blobIdSchema } from "@inboxzero/mail-core/identities";
import type { BlobStore } from "@inboxzero/mail-core/ports/blob-store";
import type { Sha256Fn } from "@inboxzero/mail-core/canonical";

const MAX_BLOB_BYTES = 25_000_000;
export const BLOB_HOLD_TTL_MS = 60 * 60 * 1000;

export type BlobFileSystem = {
  writeNew(name: string, bytes: Uint8Array): Promise<"created" | "exists">;
  read(name: string): Promise<Uint8Array | null>;
  rename(from: string, to: string): Promise<void>;
  remove(name: string): Promise<void>;
  list(): Promise<string[]>;
  mtimeMs(name: string): Promise<number | null>;
};

export type MailBlobStore = BlobStore & {
  hold(blobId: string): Promise<"held" | "missing">;
  releaseHold(blobId: string): Promise<void>;
  collectUnreferenced(input: {
    referencedIds: Iterable<string>;
    graceMs: number;
  }): Promise<{ deleted: string[] }>;
};

export function createBlobStore(input: {
  files: BlobFileSystem;
  sha256: Sha256Fn;
  nowMs?: () => number;
  randomId?: () => string;
}): MailBlobStore {
  const nowMs = input.nowMs ?? (() => Date.now());
  const randomId =
    input.randomId ??
    (() => Math.random().toString(16).slice(2).padEnd(12, "0"));
  const gates = new Map<string, Promise<void>>();

  function gate<T>(blobId: string, work: () => Promise<T>): Promise<T> {
    const previous = gates.get(blobId) ?? Promise.resolve();
    const run = previous.then(work, work);
    gates.set(
      blobId,
      run.then(
        () => undefined,
        () => undefined,
      ),
    );
    return run;
  }

  const store: MailBlobStore = {
    stage(staged) {
      const blobId = requireBlobId(staged.blobId);
      return gate(blobId, async () => {
        if (
          !Number.isSafeInteger(staged.sizeBytes) ||
          staged.sizeBytes < 0 ||
          staged.sizeBytes > MAX_BLOB_BYTES
        ) {
          return { status: "rejected", code: "too_large" };
        }
        const chunks: Uint8Array[] = [];
        let size = 0;
        for await (const chunk of staged.bytes) {
          size += chunk.byteLength;
          if (size > staged.sizeBytes) {
            return { status: "rejected", code: "too_large" };
          }
          chunks.push(chunk);
        }
        if (size !== staged.sizeBytes) {
          return { status: "rejected", code: "checksum_mismatch" };
        }
        const bytes = concat(chunks, size);
        const checksum = toHex(await input.sha256(bytes));
        if (checksum !== staged.checksum) {
          return { status: "rejected", code: "checksum_mismatch" };
        }
        const temporary = `${blobId}.${randomId()}.staging`;
        try {
          const created = await input.files.writeNew(temporary, bytes);
          if (created !== "created") {
            throw new Error("temporary blob file already exists");
          }
          await input.files.rename(temporary, `${blobId}.staging`);
          return { status: "staged" as const };
        } catch (error) {
          await input.files.remove(temporary);
          if (isDiskFullError(error)) {
            return { status: "rejected", code: "too_large" };
          }
          throw error;
        }
      });
    },
    finalize(blobId) {
      const parsed = requireBlobId(blobId);
      return gate(parsed, async () => {
        const staged = await input.files.read(`${parsed}.staging`);
        if (!staged) return null;
        const checksum = toHex(await input.sha256(staged));
        await input.files.rename(`${parsed}.staging`, parsed);
        return { blobId: parsed, sizeBytes: staged.byteLength, checksum };
      });
    },
    async read(blobId) {
      const parsed = requireBlobId(blobId);
      const bytes = await input.files.read(parsed);
      if (!bytes) return null;
      return (async function* () {
        yield bytes;
      })();
    },
    delete(blobId) {
      const parsed = requireBlobId(blobId);
      return gate(parsed, async () => {
        const names = await input.files.list();
        await Promise.all(
          names
            .filter((name) => name === parsed || name.startsWith(`${parsed}.`))
            .map((name) => input.files.remove(name)),
        );
      });
    },
    hold(blobId) {
      const parsed = requireBlobId(blobId);
      return gate(parsed, async () => {
        const finalized = await input.files.read(parsed);
        if (!finalized) return "missing" as const;
        await input.files.writeNew(`${parsed}.hold`, new Uint8Array());
        return "held" as const;
      });
    },
    releaseHold(blobId) {
      const parsed = requireBlobId(blobId);
      return gate(parsed, () => input.files.remove(`${parsed}.hold`));
    },
    async collectUnreferenced(request) {
      const referenced = new Set(request.referencedIds);
      const names = await input.files.list();
      const blobIds = new Set<string>();
      for (const name of names) {
        const blobId = blobIdFromFileName(name);
        if (blobId) blobIds.add(blobId);
      }
      const deleted: string[] = [];
      for (const blobId of blobIds) {
        if (referenced.has(blobId)) continue;
        if (await isHeld(blobId)) continue;
        const newest = await newestMtime(blobId);
        if (newest == null || nowMs() - newest < request.graceMs) continue;
        await store.delete(blobId);
        deleted.push(blobId);
      }
      return { deleted };
    },
  };

  async function isHeld(blobId: string) {
    const heldAt = await input.files.mtimeMs(`${blobId}.hold`);
    if (heldAt == null) return false;
    if (nowMs() - heldAt > BLOB_HOLD_TTL_MS) {
      await input.files.remove(`${blobId}.hold`);
      return false;
    }
    return true;
  }

  async function newestMtime(blobId: string) {
    let newest: number | null = null;
    for (const suffix of ["", ".staging", ".meta.json", ".hold"]) {
      const mtime = await input.files.mtimeMs(`${blobId}${suffix}`);
      if (mtime != null && (newest == null || mtime > newest)) newest = mtime;
    }
    return newest;
  }

  return store;
}

function requireBlobId(blobId: string) {
  const parsed = blobIdSchema.safeParse(blobId);
  if (!parsed.success) throw new Error("invalid blob id");
  return parsed.data;
}

function blobIdFromFileName(name: string) {
  if (/\.[0-9a-f-]{8,}\.staging$/i.test(name)) return null;
  let blobId = name;
  if (name.endsWith(".meta.json")) blobId = name.slice(0, -".meta.json".length);
  else if (name.endsWith(".staging"))
    blobId = name.slice(0, -".staging".length);
  else if (name.endsWith(".hold")) blobId = name.slice(0, -".hold".length);
  return blobIdSchema.safeParse(blobId).success ? blobId : null;
}

function concat(chunks: Uint8Array[], size: number) {
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function toHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function isDiskFullError(error: unknown) {
  const message = (
    error instanceof Error ? error.message : String(error)
  ).toLowerCase();
  return (
    message.includes("no space") ||
    message.includes("disk full") ||
    message.includes("enospc") ||
    message.includes("edquot")
  );
}
