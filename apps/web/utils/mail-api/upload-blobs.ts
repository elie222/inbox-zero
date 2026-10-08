import { createHash, randomUUID } from "node:crypto";
import { blobIdSchema } from "@inboxzero/mail-core/identities";
import {
  collectBlobBytes,
  isAdmissibleBlobSize,
} from "@inboxzero/mail-core/ports/blob-store";
import type { Attachment } from "@/utils/types/mail";
import { createScopedLogger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { getMailUploadStore } from "./upload-storage";

const logger = createScopedLogger("mail-api/upload-blobs");

// A send holds its uploads only while it is in flight; anything older is a
// hold the browser never released, not an upload the mailbox still needs.
const HOLD_TTL_MS = 60 * 60 * 1000;
const CLEANUP_PAGE_SIZE = 100;

export async function admitAccountUpload(
  accountId: string,
  input: {
    uploadId: string;
    checksum: string;
    sizeBytes: number;
    filename: string;
    contentType: string;
    disposition?: "attachment" | "inline";
    contentId?: string;
  },
) {
  const parsed = blobIdSchema.safeParse(input.uploadId);
  if (!parsed.success) return { status: "invalid" as const };
  if (!isAdmissibleBlobSize(input.sizeBytes)) {
    return { status: "invalid" as const };
  }
  const metadata = {
    filename: input.filename,
    contentType: input.contentType,
    disposition: input.disposition ?? null,
    contentId: input.contentId ?? null,
    checksum: input.checksum,
    sizeBytes: input.sizeBytes,
  };
  const previous = await prisma.mailUpload.findUnique({
    where: {
      emailAccountId_blobId: { emailAccountId: accountId, blobId: parsed.data },
    },
    select: { storageKey: true },
  });
  const storageKey = await newStorageKey(accountId);
  await prisma.mailUpload.upsert({
    where: {
      emailAccountId_blobId: { emailAccountId: accountId, blobId: parsed.data },
    },
    create: {
      emailAccountId: accountId,
      blobId: parsed.data,
      storageKey,
      ...metadata,
    },
    // Re-admitting the same id restarts the upload, so any half-finished
    // content and its hold are discarded.
    update: {
      ...metadata,
      storageKey,
      stagedAt: null,
      heldAt: null,
      deletionRequestedAt: null,
    },
  });
  if (previous) await deleteStoredUpload(previous.storageKey);
  return { status: "admitted" as const, blobId: parsed.data };
}

export async function putAccountUploadContent(
  accountId: string,
  uploadId: string,
  bytes: AsyncIterable<Uint8Array>,
) {
  const parsed = blobIdSchema.safeParse(uploadId);
  if (!parsed.success) return { status: "invalid" as const };
  const admitted = await prisma.mailUpload.findUnique({
    where: {
      emailAccountId_blobId: { emailAccountId: accountId, blobId: parsed.data },
    },
    select: {
      checksum: true,
      sizeBytes: true,
      storageKey: true,
      deletionRequestedAt: true,
    },
  });
  if (!admitted || admitted.deletionRequestedAt)
    return { status: "missing" as const };
  // Each writer gets a new key. A restart/cancel cannot publish the old stream
  // or let its cleanup delete a newer writer's bytes, even for identical files.
  const storageKey = await newStorageKey(accountId);
  const claimed = await prisma.mailUpload.updateMany({
    where: {
      emailAccountId: accountId,
      blobId: parsed.data,
      storageKey: admitted.storageKey,
      deletionRequestedAt: null,
    },
    data: { storageKey, stagedAt: null },
  });
  if (claimed.count === 0) return { status: "missing" as const };
  await deleteStoredUpload(admitted.storageKey);
  const verified = verifyUploadBytes(bytes, admitted);
  try {
    // A transport may never pull an empty body, so verify it up front.
    if (admitted.sizeBytes === 0) await verified.bytes.next();
    await getMailUploadStore().put(
      storageKey,
      verified.bytes,
      admitted.sizeBytes,
    );
    if (verified.outcome() !== "verified")
      throw new Error("Storage did not consume the complete upload");
  } catch {
    await deleteStoredUpload(storageKey);
    const outcome = verified.outcome();
    if (outcome === "too_large" || outcome === "checksum_mismatch")
      return { status: "rejected" as const, code: outcome };
    throw new Error("Failed to store attachment");
  } finally {
    await verified.bytes.return(undefined);
  }
  const updated = await prisma.mailUpload.updateMany({
    where: {
      emailAccountId: accountId,
      blobId: parsed.data,
      storageKey,
      deletionRequestedAt: null,
    },
    data: { stagedAt: new Date() },
  });
  if (updated.count === 0) {
    await deleteStoredUpload(storageKey);
    return { status: "missing" as const };
  }
  return {
    status: "staged" as const,
    blobId: parsed.data,
    sizeBytes: admitted.sizeBytes,
    checksum: admitted.checksum,
  };
}

export async function inspectAccountUpload(
  accountId: string,
  uploadId: string,
) {
  const parsed = blobIdSchema.safeParse(uploadId);
  if (!parsed.success) return { status: "invalid" as const };
  const staged = await prisma.mailUpload.findFirst({
    where: {
      emailAccountId: accountId,
      blobId: parsed.data,
      stagedAt: { not: null },
      deletionRequestedAt: null,
    },
    select: { id: true },
  });
  if (!staged) return { status: "missing" as const };
  return { status: "ready" as const, blobId: parsed.data };
}

export async function cancelAccountUpload(accountId: string, uploadId: string) {
  const parsed = blobIdSchema.safeParse(uploadId);
  if (!parsed.success) return { status: "invalid" as const };
  await requestUploadDeletion({
    emailAccountId: accountId,
    blobId: parsed.data,
    OR: [{ heldAt: null }, { heldAt: { lt: expiredHoldBefore() } }],
  });
  try {
    const held = await prisma.mailUpload.findUnique({
      where: {
        emailAccountId_blobId: {
          emailAccountId: accountId,
          blobId: parsed.data,
        },
      },
      select: { deletionRequestedAt: true, heldAt: true },
    });
    if (
      held &&
      !held.deletionRequestedAt &&
      held.heldAt &&
      held.heldAt >= expiredHoldBefore()
    )
      return { status: "in_use" as const, blobId: parsed.data };
  } catch (error) {
    logger.warn("Failed to inspect cancelled upload", {
      error,
      blobId: parsed.data,
    });
  }
  return { status: "deleted" as const, blobId: parsed.data };
}

export async function setAccountUploadHold(
  accountId: string,
  uploadId: string,
  held: boolean,
) {
  const parsed = blobIdSchema.safeParse(uploadId);
  if (!parsed.success) return { status: "invalid" as const };
  if (!held) {
    const released = await releaseAccountUploadHolds(accountId, [parsed.data]);
    // The caller asked for this release and can retry it, so it has to hear
    // that the hold is still there rather than read "released" and move on.
    if (!released) return { status: "unavailable" as const };
    return { status: "released" as const, blobId: parsed.data };
  }
  try {
    const heldCount = await holdAccountUploads(accountId, [parsed.data]);
    if (heldCount === 0) return { status: "missing" as const };
    return { status: "held" as const, blobId: parsed.data };
  } catch (error) {
    logger.warn("Failed to hold upload", { error, blobId: parsed.data });
    return { status: "unavailable" as const };
  }
}

export async function holdAccountUploads(accountId: string, blobIds: string[]) {
  if (blobIds.length === 0) return 0;
  const held = await prisma.mailUpload.updateMany({
    where: {
      emailAccountId: accountId,
      blobId: { in: blobIds },
      stagedAt: { not: null },
      deletionRequestedAt: null,
    },
    data: { heldAt: new Date() },
  });
  return held.count;
}

// Reports whether the release landed. The send paths run this from a `finally`
// and ignore the answer, because throwing there would discard a result the
// mailbox has already committed; the expired hold is the backstop for them.
export async function releaseAccountUploadHolds(
  accountId: string,
  blobIds: string[],
) {
  if (blobIds.length === 0) return true;
  try {
    await prisma.mailUpload.updateMany({
      where: { emailAccountId: accountId, blobId: { in: blobIds } },
      data: { heldAt: null },
    });
    return true;
  } catch (error) {
    logger.warn("Failed to release upload holds", { error, blobIds });
    return false;
  }
}

export async function readAccountUploads(accountId: string, blobIds: string[]) {
  if (blobIds.length === 0) {
    return { status: "ok" as const, uploads: [] as Attachment[] };
  }
  const rows = await prisma.mailUpload.findMany({
    where: {
      emailAccountId: accountId,
      blobId: { in: blobIds },
      stagedAt: { not: null },
      deletionRequestedAt: null,
    },
    select: {
      blobId: true,
      filename: true,
      contentType: true,
      storageKey: true,
      checksum: true,
      sizeBytes: true,
      disposition: true,
      contentId: true,
    },
  });
  const byBlobId = new Map(rows.map((row) => [row.blobId, row]));
  const uploads: Attachment[] = [];
  for (const blobId of blobIds) {
    const row = byBlobId.get(blobId);
    if (!row) return { status: "missing" as const, blobId };
    // Providers currently need base64 content, so allocate once at that boundary.
    let collected: Awaited<ReturnType<typeof collectBlobBytes>>;
    try {
      const source = await getMailUploadStore().read(row.storageKey);
      if (!source) return { status: "missing" as const, blobId };
      collected = await collectBlobBytes(source, row.sizeBytes);
    } catch {
      throw new Error("Failed to read attachment");
    }
    if (
      collected.status !== "ok" ||
      collected.bytes.byteLength !== row.sizeBytes ||
      createHash("sha256").update(collected.bytes).digest("hex") !==
        row.checksum
    ) {
      return { status: "missing" as const, blobId };
    }
    const content = Buffer.from(
      collected.bytes.buffer,
      collected.bytes.byteOffset,
      collected.bytes.byteLength,
    );
    uploads.push({
      filename: row.filename,
      contentType: row.contentType,
      content: content.toString("base64"),
      size: content.byteLength,
      ...(row.disposition === "inline" || row.disposition === "attachment"
        ? { disposition: row.disposition }
        : {}),
      ...(row.contentId ? { contentId: row.contentId } : {}),
    });
  }
  return { status: "ok" as const, uploads };
}

export async function deleteAccountUploads(
  accountId: string,
  blobIds: string[],
) {
  if (blobIds.length === 0) return;
  await requestUploadDeletion({
    emailAccountId: accountId,
    blobId: { in: blobIds },
  });
}

export async function deleteStaleMailUploads(olderThan: Date) {
  const deleted = await requestUploadDeletion({
    OR: [
      {
        updatedAt: { lt: olderThan },
        OR: [{ heldAt: null }, { heldAt: { lt: expiredHoldBefore() } }],
      },
      { deletionRequestedAt: { not: null } },
    ],
  });
  try {
    // Retain retired generations long enough for an interrupted writer to stop.
    // The ledger survives account cascades and failed immediate object cleanup.
    const where = {
      mailUpload: null,
      createdAt: { lt: expiredHoldBefore() },
    };
    // Page by key so objects whose deletion keeps failing are not re-read.
    let after = "";
    while (true) {
      const objects = await prisma.mailUploadObject.findMany({
        where: { ...where, storageKey: { gt: after } },
        take: CLEANUP_PAGE_SIZE,
        orderBy: { storageKey: "asc" },
        select: { storageKey: true },
      });
      await inBatches(objects, async (object) => {
        if (await deleteStoredUpload(object.storageKey)) {
          await prisma.mailUploadObject.deleteMany({
            where: { ...where, storageKey: object.storageKey },
          });
        }
      });
      if (objects.length < CLEANUP_PAGE_SIZE) break;
      after = objects[objects.length - 1].storageKey;
    }
  } catch (error) {
    logger.warn("Failed to clean up retired upload objects", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
  }
  return deleted;
}

// Capture keys before the cascade removes metadata, but delete bytes only after
// the account transaction commits. A failed account deletion keeps its uploads.
export async function prepareAccountUploadDeletion(accountIds: string[]) {
  try {
    const rows = await prisma.mailUploadObject.findMany({
      where: {
        OR: accountIds.map((accountId) => ({
          storageKey: { startsWith: accountStoragePrefix(accountId) },
        })),
      },
      select: { storageKey: true },
    });
    return async () => {
      await inBatches(rows, (row) => deleteStoredUpload(row.storageKey));
    };
  } catch (error) {
    logger.warn("Failed to capture account upload keys for deletion", {
      error,
      accountIds,
    });
    return async () => {};
  }
}

async function newStorageKey(accountId: string) {
  const storageKey = `${accountStoragePrefix(accountId)}${randomUUID()}`;
  // Persist before any write, including keys whose metadata claim later fails.
  await prisma.mailUploadObject.create({ data: { storageKey } });
  return storageKey;
}

async function requestUploadDeletion(where: Prisma.MailUploadWhereInput) {
  let deleted = 0;
  try {
    // Page by id so rows whose object deletion keeps failing are not re-read.
    let after = "";
    while (true) {
      const rows = await prisma.mailUpload.findMany({
        where: { ...where, id: { gt: after } },
        select: { id: true, storageKey: true },
        take: CLEANUP_PAGE_SIZE,
        orderBy: { id: "asc" },
      });
      await inBatches(rows, async (row) => {
        // Invalidate before touching the object. Holds and in-flight writers must
        // not claim it; retain the key until deletion succeeds so cron can retry.
        const requested = await prisma.mailUpload.updateMany({
          where: { ...where, id: row.id, storageKey: row.storageKey },
          data: { deletionRequestedAt: new Date(), stagedAt: null },
        });
        if (
          requested.count === 0 ||
          !(await deleteStoredUpload(row.storageKey))
        )
          return;
        const result = await prisma.mailUpload.deleteMany({
          where: {
            id: row.id,
            storageKey: row.storageKey,
            deletionRequestedAt: { not: null },
          },
        });
        deleted += result.count;
      });
      if (rows.length < CLEANUP_PAGE_SIZE) break;
      after = rows[rows.length - 1].id;
    }
  } catch (error) {
    // Cleanup cannot turn a committed send/cancel into a failed user action.
    logger.warn("Failed to clean up mail uploads", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
  }
  return deleted;
}

async function deleteStoredUpload(storageKey: string) {
  try {
    await getMailUploadStore().delete(storageKey);
    return true;
  } catch (error) {
    logger.warn("Failed to delete stored upload", {
      errorType: error instanceof Error ? error.name : "UnknownError",
    });
    return false;
  }
}

// Streams the body through while checking it against its admission. The last
// chunk is withheld until the checksum matches: a transport can finish as soon
// as Content-Length is satisfied, before the iterator would report a mismatch.
function verifyUploadBytes(
  bytes: AsyncIterable<Uint8Array>,
  expected: { sizeBytes: number; checksum: string },
) {
  let outcome: "pending" | "verified" | "too_large" | "checksum_mismatch" =
    "pending";
  const verified = (async function* () {
    const hash = createHash("sha256");
    let size = 0;
    let pending: Uint8Array | undefined;
    for await (const chunk of bytes) {
      size += chunk.byteLength;
      if (size > expected.sizeBytes) {
        outcome = "too_large";
        throw new Error("Upload exceeds admitted size");
      }
      hash.update(chunk);
      if (chunk.byteLength === 0) continue;
      if (pending) yield pending;
      pending = chunk;
    }
    if (
      size !== expected.sizeBytes ||
      hash.digest("hex") !== expected.checksum
    ) {
      outcome = "checksum_mismatch";
      throw new Error("Upload does not match admission");
    }
    outcome = "verified";
    if (pending) yield pending;
  })();
  return { bytes: verified, outcome: () => outcome };
}

// Bounds concurrent storage requests during bulk cleanup.
async function inBatches<T>(items: T[], run: (item: T) => Promise<unknown>) {
  for (let offset = 0; offset < items.length; offset += 10) {
    await Promise.all(items.slice(offset, offset + 10).map(run));
  }
}

function expiredHoldBefore() {
  return new Date(Date.now() - HOLD_TTL_MS);
}

function accountStoragePrefix(accountId: string) {
  return `${createHash("sha256").update(accountId).digest("hex")}.`;
}
