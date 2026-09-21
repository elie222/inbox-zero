import type { IDBPTransaction, StoreNames } from "idb";
import {
  createAccountedMailTransaction,
  meterLocalMailStorageTransaction,
  LocalMailStorageCapacityError,
} from "./optional-cache-write";
import {
  evaluateLocalMailLogicalAdmission,
  readLocalMailStorageLedger,
  localMailLedgerBytes,
} from "./local-mail-storage-ledger";
import { randomUuid } from "@/utils/uuid";
import {
  captureEmailCacheEpoch,
  getEmailCacheDatabase,
  isEmailCacheEpochCurrent,
  type EmailCacheSchema,
} from "./database";
import type {
  LocalMailAttachmentReference,
  LocalMailAttachmentKey,
} from "./local-mail-attachments-types";
import { readLocalMailSettings } from "./local-mail-settings";
import {
  readLocalMailStorageAdmission,
  withLocalMailStorageLock,
} from "./local-mail-storage";

type Transaction = IDBPTransaction<
  EmailCacheSchema,
  StoreNames<EmailCacheSchema>[],
  "readwrite"
>;
type Scope = { emailAccountId: string; threadId: string };
type Options = {
  signal?: AbortSignal;
  attachmentBudgetBytes?: number;
  now?: number;
  readAdmission?: () => Promise<{ remainingBytes: number; limitBytes: number }>;
  enforceLogicalBudget?: boolean;
  withStorageLock?: typeof withLocalMailStorageLock;
};
type Ticket = {
  reference: LocalMailAttachmentReference;
  reservationId: string;
  generation: string;
  epoch: ReturnType<typeof captureEmailCacheEpoch>;
  maxBytes: number;
};
const stores: StoreNames<EmailCacheSchema>[] = [
  "localMailAttachmentFiles",
  "localMailAttachmentJobs",
  "localMailMessages",
  "localMailThreadProtection",
  "searchIndexAccounts",
  "mailMutations",
  "replyDrafts",
];
const RESERVATION_MS = 5 * 60_000;

export async function getLocalMailAttachmentReference({
  emailAccountId,
  messageId,
  attachmentId,
}: {
  emailAccountId: string;
  messageId: string;
  attachmentId: string;
}) {
  const database = await getEmailCacheDatabase();
  if (!database) return;
  const row = await database.get("localMailMessages", [
    emailAccountId,
    messageId,
  ]);
  return row && attachmentReference(row, attachmentId);
}

export async function prepareLocalMailAttachmentDownload(
  options: Options & {
    reference: LocalMailAttachmentReference;
    maxBytes: number;
  },
): Promise<Ticket | undefined> {
  validateBytes(options.maxBytes);
  return withTransaction(options, async (tx, budget, remainingBytes, now) => {
    const { reference, maxBytes } = options;
    if (!(await referenceIsCurrent(tx, reference))) return;
    const account = await tx
      .objectStore("searchIndexAccounts")
      .get(reference.emailAccountId);
    if (!account) return;
    const previous = await tx
      .objectStore("localMailAttachmentJobs")
      .get(key(reference));
    const protection = await tx
      .objectStore("localMailThreadProtection")
      .get([reference.emailAccountId, reference.threadId]);
    const reservationId = `attachment:${randomUuid()}`;
    const reserved = await reservedBytes(
      tx,
      now,
      new Set(previous ? [previous.reservationId] : []),
    );
    if (!(await makeRoom(tx, maxBytes + reserved, budget, now))) return;
    if (maxBytes + reserved > remainingBytes) return;
    const epoch = captureEmailCacheEpoch(reference.emailAccountId);
    if (!epoch) return;
    await tx.objectStore("localMailAttachmentJobs").put({
      ...reference,
      reservationId,
      state: "pending",
      attempts: previous?.attempts ?? 0,
      updatedAt: now,
    });
    const reservations = { ...protection?.reservations };
    if (previous) delete reservations[previous.reservationId];
    await tx.objectStore("localMailThreadProtection").put({
      ...protection,
      emailAccountId: reference.emailAccountId,
      threadId: reference.threadId,
      generation: account.generation,
      reservations: {
        ...reservations,
        [reservationId]: { bytes: maxBytes, expiresAt: now + RESERVATION_MS },
      },
    });
    return {
      reference,
      reservationId,
      generation: account.generation,
      epoch,
      maxBytes,
    };
  });
}

export async function commitLocalMailAttachmentDownload(
  options: Options & { ticket: Ticket; blob: Blob },
) {
  if (!options.ticket || options.blob.size > options.ticket.maxBytes)
    return false;
  return (
    (await withTransaction(options, async (tx, budget, remainingBytes, now) => {
      const { ticket, blob } = options;
      const { reference } = ticket;
      const account = await tx
        .objectStore("searchIndexAccounts")
        .get(reference.emailAccountId);
      const job = await tx
        .objectStore("localMailAttachmentJobs")
        .get(key(reference));
      const protection = await tx
        .objectStore("localMailThreadProtection")
        .get([reference.emailAccountId, reference.threadId]);
      const reservation = protection?.reservations?.[ticket.reservationId];
      if (
        !isEmailCacheEpochCurrent(reference.emailAccountId, ticket.epoch) ||
        account?.generation !== ticket.generation ||
        job?.reservationId !== ticket.reservationId ||
        !reservation ||
        reservation.expiresAt <= now ||
        blob.size > reservation.bytes ||
        !(await referenceIsCurrent(tx, reference))
      )
        return false;
      const previous = await tx
        .objectStore("localMailAttachmentFiles")
        .get(key(reference));
      const growth = Math.max(0, blob.size - (previous?.byteSize ?? 0));
      const reserved = await reservedBytes(
        tx,
        now,
        new Set([ticket.reservationId]),
      );
      const used = await storedBytes(tx);
      if (
        used + growth + reserved > budget ||
        growth + reserved > remainingBytes
      )
        return false;
      await tx.objectStore("localMailAttachmentFiles").put({
        ...reference,
        blob,
        byteSize: blob.size,
        lastAccessedAt: now,
      });
      await tx.objectStore("searchIndexAccounts").put({
        ...account,
        attachmentBytes:
          (account.attachmentBytes ?? 0) +
          blob.size -
          (previous?.byteSize ?? 0),
      });
      await releaseReservation(tx, reference, ticket.reservationId);
      await tx
        .objectStore("localMailAttachmentJobs")
        .put({ ...job, state: "complete", updatedAt: now });
      return true;
    })) ?? false
  );
}

export async function readLocalMailAttachment(
  reference: LocalMailAttachmentReference,
) {
  const epoch = captureEmailCacheEpoch(reference.emailAccountId);
  const database = await getEmailCacheDatabase();
  if (!database || !epoch) return;
  const tx = await createAccountedMailTransaction(database, stores);
  const record = await tx
    .objectStore("localMailAttachmentFiles")
    .get(key(reference));
  if (
    !record ||
    record.blob.size !== record.byteSize ||
    !(await referenceIsCurrent(tx, reference))
  ) {
    await tx.done;
    return;
  }
  await tx
    .objectStore("localMailAttachmentFiles")
    .put({ ...record, lastAccessedAt: Date.now() });
  await tx.done;
  if (isEmailCacheEpochCurrent(reference.emailAccountId, epoch))
    return record.blob;
}

export async function markLocalMailAttachmentDownloadFailed(ticket: Ticket) {
  const database = await getEmailCacheDatabase();
  if (!database) return;
  const tx = await createAccountedMailTransaction(database, stores);
  const job = await tx
    .objectStore("localMailAttachmentJobs")
    .get(key(ticket.reference));
  const account = await tx
    .objectStore("searchIndexAccounts")
    .get(ticket.reference.emailAccountId);
  if (
    job?.reservationId === ticket.reservationId &&
    account?.generation === ticket.generation &&
    isEmailCacheEpochCurrent(ticket.reference.emailAccountId, ticket.epoch)
  ) {
    await releaseReservation(tx, job, ticket.reservationId);
    await tx.objectStore("localMailAttachmentJobs").put({
      ...job,
      state: "failed",
      attempts: job.attempts + 1,
      updatedAt: Date.now(),
    });
  }
  await tx.done;
}

export async function invalidateLocalMailMessageAttachments(
  tx: Transaction,
  emailAccountId: string,
  messageId: string,
  next?: EmailCacheSchema["localMailMessages"]["value"],
) {
  let removedBytes = 0;
  let file = await tx
    .objectStore("localMailAttachmentFiles")
    .index("byAccountMessage")
    .openCursor([emailAccountId, messageId]);
  while (file) {
    const current = next && attachmentReference(next, file.value.attachmentId);
    if (
      !current ||
      current.threadId !== file.value.threadId ||
      current.revision !== file.value.revision
    ) {
      removedBytes += file.value.byteSize;
      await file.delete();
    }
    file = await file.continue();
  }
  let job = await tx
    .objectStore("localMailAttachmentJobs")
    .index("byAccountMessage")
    .openCursor([emailAccountId, messageId]);
  while (job) {
    const current = next && attachmentReference(next, job.value.attachmentId);
    if (
      !current ||
      current.threadId !== job.value.threadId ||
      current.revision !== job.value.revision
    ) {
      await releaseReservation(tx, job.value, job.value.reservationId);
      await job.delete();
    }
    job = await job.continue();
  }
  const account = await tx
    .objectStore("searchIndexAccounts")
    .get(emailAccountId);
  if (removedBytes && account)
    await tx.objectStore("searchIndexAccounts").put({
      ...account,
      attachmentBytes: Math.max(
        0,
        (account.attachmentBytes ?? 0) - removedBytes,
      ),
    });
}

async function withTransaction<T>(
  options: Options & {
    emailAccountId?: string;
    reference?: LocalMailAttachmentReference;
    ticket?: Ticket;
  },
  run: (
    tx: Transaction,
    budget: number,
    remainingBytes: number,
    now: number,
  ) => Promise<T>,
) {
  const emailAccountId =
    options.emailAccountId ??
    options.reference?.emailAccountId ??
    options.ticket?.reference.emailAccountId;
  if (!emailAccountId) return;
  const epoch = captureEmailCacheEpoch(emailAccountId);
  return (options.withStorageLock ?? withLocalMailStorageLock)(
    async () => {
      options.signal?.throwIfAborted();
      const database = await getEmailCacheDatabase();
      if (!database || !isEmailCacheEpochCurrent(emailAccountId, epoch)) return;
      const budget =
        options.attachmentBudgetBytes ??
        (await readLocalMailSettings()).attachmentBudgetBytes;
      validateBytes(budget);
      const admission = await (
        options.readAdmission ??
        (() =>
          readLocalMailStorageAdmission({
            expectedGrowthBytes: 0,
            purpose: "backfill",
          }))
      )();
      let remaining = Number.isFinite(admission.remainingBytes)
        ? Math.max(0, admission.remainingBytes)
        : 0;
      options.signal?.throwIfAborted();
      const native = database.transaction(
        [...stores, "localMailStorageLedger"],
        "readwrite",
      );
      const ledger = await readLocalMailStorageLedger(native);
      const initialBytes = localMailLedgerBytes(ledger);
      const enforce = options.enforceLogicalBudget ?? true;
      if (enforce)
        remaining = evaluateLocalMailLogicalAdmission({
          ledger,
          limitBytes: admission.limitBytes,
          originRemainingBytes: remaining,
        }).remainingBytes;
      const tx = await meterLocalMailStorageTransaction(native, {
        maxGrowthBytes: enforce ? remaining : Number.POSITIVE_INFINITY,
        logicalLimitBytes: admission.limitBytes,
        enforceLogicalBudget: enforce,
      });
      try {
        const result = await run(
          tx,
          budget,
          remaining,
          options.now ?? Date.now(),
        );
        if (enforce && result !== undefined && result !== false) {
          const outstanding = await reservedBytes(
            tx,
            options.now ?? Date.now(),
          );
          const currentLedger = await readLocalMailStorageLedger(native);
          const growth = Math.max(
            0,
            localMailLedgerBytes(currentLedger) - initialBytes,
          );
          if (
            !evaluateLocalMailLogicalAdmission({
              ledger: currentLedger,
              limitBytes: admission.limitBytes,
              originRemainingBytes: Math.max(
                0,
                admission.remainingBytes - growth,
              ),
              expectedGrowthBytes: outstanding,
            }).allowed
          )
            throw new LocalMailStorageCapacityError(
              "Attachment storage capacity exhausted",
            );
        }
        options.signal?.throwIfAborted();
        if (!isEmailCacheEpochCurrent(emailAccountId, epoch)) {
          tx.abort();
          await tx.done.catch(() => undefined);
          return;
        }
        await tx.done;
        return result;
      } catch (error) {
        try {
          tx.abort();
        } catch {}
        await tx.done.catch(() => undefined);
        if (error instanceof LocalMailStorageCapacityError) return;
        throw error;
      }
    },
    { wait: true, signal: options.signal },
  );
}

function attachmentReference(
  row: EmailCacheSchema["localMailMessages"]["value"],
  attachmentId: string,
): LocalMailAttachmentReference | undefined {
  if (row.bodyFetchedAt === undefined) return;
  const attachment = [...(row.data.attachments ?? []), ...row.data.inline].find(
    (entry) => entry.attachmentId === attachmentId,
  );
  if (!attachment?.attachmentId) return;
  // Until every provider supplies a content revision, a refreshed body fences
  // reuse even when attachment metadata is unchanged.
  const revision = JSON.stringify([
    row.bodyFetchedAt,
    attachment.filename,
    attachment.mimeType,
    attachment.size,
    attachment.headers["content-id"],
  ]);
  return {
    emailAccountId: row.emailAccountId,
    threadId: row.threadId,
    messageId: row.messageId,
    attachmentId,
    revision,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    reportedBytes:
      Number.isSafeInteger(attachment.size) && attachment.size > 0
        ? attachment.size
        : undefined,
  };
}

async function referenceIsCurrent(
  tx: Transaction,
  reference: LocalMailAttachmentReference,
) {
  const row = await tx
    .objectStore("localMailMessages")
    .get([reference.emailAccountId, reference.messageId]);
  const current = row && attachmentReference(row, reference.attachmentId);
  return (
    current?.threadId === reference.threadId &&
    current?.revision === reference.revision &&
    current?.filename === reference.filename &&
    current?.mimeType === reference.mimeType &&
    current?.reportedBytes === reference.reportedBytes
  );
}

function key(reference: LocalMailAttachmentReference): LocalMailAttachmentKey {
  return [
    reference.emailAccountId,
    reference.messageId,
    reference.attachmentId,
    reference.revision,
  ];
}

function validateBytes(bytes: number) {
  if (!Number.isSafeInteger(bytes) || bytes < 0)
    throw new Error("Invalid attachment byte limit");
}

async function storedBytes(tx: Transaction) {
  return (await tx.objectStore("searchIndexAccounts").getAll()).reduce(
    (sum, account) => sum + (account.attachmentBytes ?? 0),
    0,
  );
}

async function reservedBytes(
  tx: Transaction,
  now: number,
  excluded = new Set<string>(),
) {
  let bytes = 0;
  let cursor = await tx.objectStore("localMailThreadProtection").openCursor();
  while (cursor) {
    for (const [id, reservation] of Object.entries(
      cursor.value.reservations ?? {},
    ))
      if (
        id.startsWith("attachment:") &&
        !excluded.has(id) &&
        reservation.expiresAt > now
      )
        bytes += reservation.bytes;
    cursor = await cursor.continue();
  }
  return bytes;
}

async function releaseReservation(
  tx: Transaction,
  reference: Scope,
  reservationId: string,
) {
  const store = tx.objectStore("localMailThreadProtection");
  const protection = await store.get([
    reference.emailAccountId,
    reference.threadId,
  ]);
  if (!protection) return;
  const reservations = { ...protection.reservations };
  delete reservations[reservationId];
  await store.put({ ...protection, reservations });
}

async function makeRoom(
  tx: Transaction,
  requiredBytes: number,
  budget: number,
  now: number,
) {
  let used = await storedBytes(tx);
  if (requiredBytes > budget) return false;
  let cursor = await tx
    .objectStore("localMailAttachmentFiles")
    .index("byLastAccessed")
    .openCursor();
  let scanned = 0;
  while (cursor && used + requiredBytes > budget && scanned++ < 100) {
    const file = cursor.value;
    const scope: [string, string] = [file.emailAccountId, file.threadId];
    const protection = await tx
      .objectStore("localMailThreadProtection")
      .get(scope);
    const reserved = Object.values(protection?.reservations ?? {}).some(
      (entry) => entry.bytes > 0 && entry.expiresAt > now,
    );
    const drafts = await tx
      .objectStore("replyDrafts")
      .index("byAccountThread")
      .getAll(scope);
    const mutations = await tx
      .objectStore("mailMutations")
      .index("byAccountThread")
      .getAll(scope);
    if (
      !reserved &&
      !drafts.some((draft) => draft.content !== null) &&
      !mutations.some((mutation) => mutation.status !== "succeeded")
    ) {
      const account = await tx
        .objectStore("searchIndexAccounts")
        .get(file.emailAccountId);
      await cursor.delete();
      used -= file.byteSize;
      if (account)
        await tx.objectStore("searchIndexAccounts").put({
          ...account,
          attachmentBytes: Math.max(
            0,
            (account.attachmentBytes ?? 0) - file.byteSize,
          ),
        });
    }
    cursor = await cursor.continue();
  }
  return used + requiredBytes <= budget;
}
