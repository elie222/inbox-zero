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
    if (
      previous?.snapshotId &&
      protection?.pinSnapshotId !== previous.snapshotId
    )
      return;
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
      snapshotId: previous?.snapshotId,
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
        (job.snapshotId && protection?.pinSnapshotId !== job.snapshotId) ||
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

export async function createLocalMailOfflineSnapshot(
  options: Options &
    Scope & {
      references: LocalMailAttachmentReference[];
      messageIds?: string[];
    },
) {
  return withTransaction(options, async (tx, budget, remainingBytes, now) => {
    const { emailAccountId, threadId } = options;
    const account = await tx
      .objectStore("searchIndexAccounts")
      .get(emailAccountId);
    if (!account) return;
    let pinMessageRevisions: Record<string, number> | undefined;
    if (options.messageIds) {
      if (!options.messageIds.length) return;
      const revisions = new Map<string, number>();
      for (const messageId of new Set(options.messageIds)) {
        const message = await tx
          .objectStore("localMailMessages")
          .get([emailAccountId, messageId]);
        if (
          !message ||
          message.threadId !== threadId ||
          message.bodyFetchedAt === undefined ||
          !Number.isFinite(message.bodyFetchedAt)
        )
          return;
        revisions.set(messageId, message.bodyFetchedAt);
      }
      pinMessageRevisions = Object.fromEntries(revisions);
    }
    const references = [
      ...new Map(
        options.references.map((reference) => [
          JSON.stringify(key(reference)),
          reference,
        ]),
      ).values(),
    ];
    for (const reference of references)
      if (
        reference.emailAccountId !== emailAccountId ||
        reference.threadId !== threadId ||
        !(await referenceIsCurrent(tx, reference))
      )
        return;
    const protection = await tx
      .objectStore("localMailThreadProtection")
      .get([emailAccountId, threadId]);
    const previousJobs = await tx
      .objectStore("localMailAttachmentJobs")
      .index("byAccountThread")
      .getAll([emailAccountId, threadId]);
    const reserved = await reservedBytes(
      tx,
      now,
      new Set(previousJobs.map((job) => job.reservationId)),
    );
    const pending: LocalMailAttachmentReference[] = [];
    for (const reference of references)
      if (
        !(await tx
          .objectStore("localMailAttachmentFiles")
          .getKey(key(reference)))
      )
        pending.push(reference);
    const required = pending.reduce(
      (sum, reference) => sum + (reference.reportedBytes ?? 0),
      0,
    );
    const snapshotKeys = new Set(
      references.map((reference) => JSON.stringify(key(reference))),
    );
    if (
      !(await makeRoom(tx, required + reserved, budget, now, snapshotKeys)) ||
      required + reserved > remainingBytes
    )
      return;
    const snapshotId = randomUuid();
    for (const job of previousJobs) {
      await releaseReservation(tx, job, job.reservationId);
      await tx.objectStore("localMailAttachmentJobs").delete(key(job));
    }
    const currentProtection = await tx
      .objectStore("localMailThreadProtection")
      .get([emailAccountId, threadId]);
    const reservations = { ...currentProtection?.reservations };
    for (const reference of references) {
      const reservationId = `attachment:${randomUuid()}`;
      const missing = pending.includes(reference);
      if (missing && reference.reportedBytes !== undefined)
        reservations[reservationId] = {
          bytes: reference.reportedBytes,
          expiresAt: now + RESERVATION_MS,
        };
      await tx.objectStore("localMailAttachmentJobs").put({
        ...reference,
        snapshotId,
        reservationId,
        state: missing ? "pending" : "complete",
        attempts: 0,
        updatedAt: now,
      });
    }
    await tx.objectStore("localMailThreadProtection").put({
      ...protection,
      emailAccountId,
      threadId,
      generation: account.generation,
      pinned: true,
      pinSnapshotId: snapshotId,
      pinSnapshotInvalidated: false,
      pinMessageRevisions,
      reservations,
    });
    return snapshotId;
  });
}

export async function readLocalMailOfflineSnapshot(scope: Scope) {
  const epoch = captureEmailCacheEpoch(scope.emailAccountId);
  const database = await getEmailCacheDatabase();
  if (!database) return;
  const tx = await createAccountedMailTransaction(database, stores);
  const protection = await tx
    .objectStore("localMailThreadProtection")
    .get([scope.emailAccountId, scope.threadId]);
  if (!protection?.pinned || !protection.pinSnapshotId) {
    await tx.done;
    return;
  }
  const jobs = (
    await tx
      .objectStore("localMailAttachmentJobs")
      .index("byAccountThread")
      .getAll([scope.emailAccountId, scope.threadId])
  ).filter((job) => job.snapshotId === protection.pinSnapshotId);
  let attachmentsReady = !protection.pinSnapshotInvalidated;
  const remainingMessages = new Set(
    Object.keys(protection.pinMessageRevisions ?? {}),
  );
  let messagesReady =
    remainingMessages.size > 0 && !protection.pinSnapshotInvalidated;
  let cachedBytes = 0;
  for (const job of jobs) {
    const file = await tx.objectStore("localMailAttachmentFiles").get(key(job));
    const available =
      file &&
      file.blob.size === file.byteSize &&
      (await referenceIsCurrent(tx, job));
    if (!available) attachmentsReady = false;
    else cachedBytes += file.byteSize;
  }
  const snapshotKeys = new Set(jobs.map((job) => JSON.stringify(key(job))));
  let cursor = await tx
    .objectStore("localMailMessages")
    .index("byAccountThreadMessage")
    .openCursor(
      IDBKeyRange.bound(
        [scope.emailAccountId, scope.threadId, ""],
        [scope.emailAccountId, scope.threadId, []],
      ),
    );
  while (cursor) {
    const message = cursor.value;
    if (
      !remainingMessages.delete(message.messageId) ||
      message.bodyFetchedAt === undefined ||
      protection.pinMessageRevisions?.[message.messageId] !==
        message.bodyFetchedAt
    )
      messagesReady = false;
    for (const attachment of [
      ...(cursor.value.data.attachments ?? []),
      ...cursor.value.data.inline,
    ]) {
      const reference = attachmentReference(
        cursor.value,
        attachment.attachmentId,
      );
      if (!reference || !snapshotKeys.has(JSON.stringify(key(reference))))
        attachmentsReady = false;
    }
    cursor = await cursor.continue();
  }
  await tx.done;
  if (!isEmailCacheEpochCurrent(scope.emailAccountId, epoch)) return;
  return {
    snapshotId: protection.pinSnapshotId,
    attachmentsReady,
    messagesReady: messagesReady && remainingMessages.size === 0,
    cachedBytes,
    unknownSizeCount: jobs.filter((job) => job.reportedBytes === undefined)
      .length,
    files: jobs,
  };
}

export async function cancelLocalMailOfflineSnapshot(scope: Scope) {
  const database = await getEmailCacheDatabase();
  if (!database) return;
  const tx = await createAccountedMailTransaction(database, stores);
  const protection = await tx
    .objectStore("localMailThreadProtection")
    .get([scope.emailAccountId, scope.threadId]);
  if (!protection?.pinSnapshotId) {
    await tx.done;
    return;
  }
  const jobs = await tx
    .objectStore("localMailAttachmentJobs")
    .index("byAccountThread")
    .getAll([scope.emailAccountId, scope.threadId]);
  for (const job of jobs) {
    if (job.snapshotId !== protection?.pinSnapshotId) continue;
    await releaseReservation(tx, job, job.reservationId);
    await tx.objectStore("localMailAttachmentJobs").delete(key(job));
  }
  const current = await tx
    .objectStore("localMailThreadProtection")
    .get([scope.emailAccountId, scope.threadId]);
  if (current)
    await tx.objectStore("localMailThreadProtection").put({
      ...current,
      pinned: false,
      pinSnapshotId: undefined,
      pinMessageRevisions: undefined,
    });
  await tx.done;
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
  const affectedThreads = new Set<string>();
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
      affectedThreads.add(file.value.threadId);
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
      affectedThreads.add(job.value.threadId);
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
  for (const threadId of affectedThreads) {
    const protection = await tx
      .objectStore("localMailThreadProtection")
      .get([emailAccountId, threadId]);
    if (protection?.pinSnapshotId)
      await tx
        .objectStore("localMailThreadProtection")
        .put({ ...protection, pinSnapshotInvalidated: true });
  }
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
  excluded = new Set<string>(),
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
      !excluded.has(JSON.stringify(key(file))) &&
      !protection?.pinned &&
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
