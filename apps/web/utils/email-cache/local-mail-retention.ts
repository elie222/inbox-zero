import { createAccountedMailTransaction } from "./optional-cache-write";
import {
  captureEmailCacheEpoch,
  getEmailCacheDatabase,
  isEmailCacheEpochCurrent,
} from "./database";
import { notifyEmailCacheChange } from "./cache-events";
import { evictLocalMailMessage } from "./local-mail-messages";
import {
  readLocalMailStorageAdmission,
  withLocalMailStorageLock,
} from "./local-mail-storage";
import { isMailSyncActivated } from "./mail-activation";
import type {
  LocalMailEvictionJob,
  LocalMailThreadProtection,
} from "./local-mail-retention-types";

const stores = [
  "localMailRetentionPolicies",
  "localMailEvictionJobs",
  "localMailEvictedMessages",
  "localMailThreadProtection",
  "localMailMessages",
  "localMailTombstones",
  "mailboxMessages",
  "searchIndexAccounts",
  "searchIndexWork",
  "localMailSyncStates",
  "mailMutations",
  "replyDrafts",
  "threadRows",
  "threadDetails",

  "localMailAttachmentFiles",
  "localMailAttachmentJobs",
] as const;

type Options = {
  emailAccountId: string;
  generation: string;
  withStorageLock?: typeof withLocalMailStorageLock;
};

export async function beginLocalMailEviction(
  options: Options & {
    kind?: "exceptions";
    automatic?: { emailAccountIds: string[] };
    after: number;
    before: number;
    now: number;
    protectedRecentAfter: number;
    protectedFetchedAfter: number;
  },
) {
  if (
    ![
      options.after,
      options.before,
      options.now,
      options.protectedRecentAfter,
      options.protectedFetchedAfter,
    ].every(Number.isSafeInteger) ||
    options.after >= options.before ||
    options.before > options.protectedRecentAfter
  )
    throw new Error("Invalid local mail eviction range");
  const epoch = captureEmailCacheEpoch(options.emailAccountId);
  return (options.withStorageLock ?? withLocalMailStorageLock)(async () => {
    const database = await getEmailCacheDatabase();
    if (!database || !isEmailCacheEpochCurrent(options.emailAccountId, epoch))
      return;
    if (options.automatic) {
      if (
        !options.automatic.emailAccountIds.includes(options.emailAccountId) ||
        !isMailSyncActivated(options.emailAccountId)
      )
        return;
      const admission = await readLocalMailStorageAdmission();
      if (admission.reason !== "storage-full") return;
    }
    const tx = await createAccountedMailTransaction(database, stores);
    try {
      const account = await tx
        .objectStore("searchIndexAccounts")
        .get(options.emailAccountId);
      const sync = await tx
        .objectStore("localMailSyncStates")
        .get(options.emailAccountId);
      if (
        account?.generation !== options.generation ||
        sync?.generation !== options.generation
      )
        throw new Error("Local mail eviction generation is stale");
      if (options.automatic) {
        const activeIds = new Set(
          options.automatic.emailAccountIds.filter(isMailSyncActivated),
        );
        const pending = await tx.objectStore("localMailEvictionJobs").getAll();
        if (
          !activeIds.has(options.emailAccountId) ||
          pending.some((job) => activeIds.has(job.emailAccountId))
        ) {
          await tx.done;
          return;
        }
      }
      const policies = tx.objectStore("localMailRetentionPolicies");
      const previous = await policies.get(options.emailAccountId);
      const exceptions = options.kind === "exceptions";
      if (
        exceptions &&
        (!previous ||
          previous.generation !== options.generation ||
          options.before >
            Math.max(previous.requestedAfter, previous.automaticAfter) ||
          (previous.exceptionSweepAfter ?? 0) > options.now)
      ) {
        await tx.done;
        return;
      }
      const existing = await tx
        .objectStore("localMailEvictionJobs")
        .get(options.emailAccountId);
      if (existing) throw new Error("Local mail eviction is already pending");
      if (
        sync.recovering ||
        (!exceptions &&
          (!sync.coverage ||
            options.after < sync.coverage.after ||
            options.before > sync.coverage.before)) ||
        Object.values(sync.folders).some((folder) => folder.recovering)
      )
        throw new Error("Local mail eviction requires complete coverage");
      // Evict only an oldest prefix; an interior hole cannot be represented by
      // the coordinator's contiguous coverage contract.
      if (!exceptions && options.after !== sync.coverage?.after)
        throw new Error(
          "Local mail eviction must remove oldest coverage first",
        );
      const revision = (account.retentionRevision ?? 0) + 1;
      await policies.put({
        ...previous,
        emailAccountId: options.emailAccountId,
        generation: options.generation,
        revision,
        requestedAfter: previous?.requestedAfter ?? sync.retentionAfter,
        automaticAfter: exceptions
          ? previous!.automaticAfter
          : Math.max(
              previous?.automaticAfter ?? options.before,
              options.before,
            ),
      });
      await tx
        .objectStore("searchIndexAccounts")
        .put({ ...account, retentionRevision: revision });
      sync.fence++;
      sync.leaseOwner = undefined;
      sync.leaseExpiresAt = undefined;
      if (!exceptions) {
        const coverage = sync.coverage;
        if (!coverage)
          throw new Error("Local mail eviction requires complete coverage");
        sync.retentionAfter = Math.max(sync.retentionAfter, options.before);
        sync.retainedAfter = Math.max(sync.retainedAfter, options.before);
        sync.coverage =
          options.before < coverage.before
            ? { ...coverage, after: options.before }
            : undefined;
        for (const folder of Object.values(sync.folders))
          folder.after = Math.min(
            folder.before,
            Math.max(folder.after, options.before),
          );
      }
      await tx.objectStore("localMailSyncStates").put(sync);
      const job: LocalMailEvictionJob = {
        kind: options.kind,
        emailAccountId: options.emailAccountId,
        generation: options.generation,
        revision,
        after: options.after,
        before: options.before,
        startedAt: options.now,
        protectedRecentAfter: options.protectedRecentAfter,
        protectedFetchedAfter: options.protectedFetchedAfter,
        stage: "remove-source",
        removedBytes: 0,
      };
      await tx.objectStore("localMailEvictionJobs").put(job);
      if (!isEmailCacheEpochCurrent(options.emailAccountId, epoch))
        throw new Error("Local mail cache was cleared");
      await tx.done;
      notifyEmailCacheChange(options.emailAccountId);
      return job;
    } catch (error) {
      try {
        tx.abort();
      } catch {}
      await tx.done.catch(() => undefined);
      throw error;
    }
  });
}

export async function runLocalMailEvictionBatch(
  options: Options & { revision: number; now: number; limit?: number },
) {
  const limit = options.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Invalid eviction batch size");
  const epoch = captureEmailCacheEpoch(options.emailAccountId);
  return (options.withStorageLock ?? withLocalMailStorageLock)(async () => {
    const database = await getEmailCacheDatabase();
    if (!database || !isEmailCacheEpochCurrent(options.emailAccountId, epoch))
      return;
    const tx = await createAccountedMailTransaction(database, stores);
    try {
      const account = await tx
        .objectStore("searchIndexAccounts")
        .get(options.emailAccountId);
      const job = await tx
        .objectStore("localMailEvictionJobs")
        .get(options.emailAccountId);
      if (
        !job ||
        account?.generation !== options.generation ||
        job.generation !== options.generation ||
        account.retentionRevision !== options.revision ||
        job.revision !== options.revision
      )
        throw new Error("Local mail eviction checkpoint is stale");
      if (job.stage !== "remove-source") {
        await tx.done;
        return job;
      }
      let cursor = await tx
        .objectStore("localMailMessages")
        .index("byAccountReceivedAt")
        .openCursor(
          IDBKeyRange.bound(
            [options.emailAccountId, job.cursor?.receivedAt ?? job.after],
            [options.emailAccountId, job.before],
            false,
            true,
          ),
        );
      if (cursor && job.cursor) {
        if (
          cursor.value.receivedAt === job.cursor.receivedAt &&
          cursor.value.messageId < job.cursor.messageId
        )
          cursor = await cursor.continuePrimaryKey(
            [options.emailAccountId, job.cursor.receivedAt],
            [options.emailAccountId, job.cursor.messageId],
          );
        if (cursor?.value.messageId === job.cursor.messageId)
          cursor = await cursor.continue();
      }
      let scanned = 0;
      let bytes = 0;
      while (cursor && scanned < limit && bytes < 4 * 1024 * 1024) {
        const row = cursor.value;
        if (
          await evictLocalMailMessage(tx, row, job.revision, options.now, {
            recentAfter: job.protectedRecentAfter,
            fetchedAfter: job.protectedFetchedAfter,
          })
        )
          job.removedBytes += row.byteSize;
        job.cursor = { receivedAt: row.receivedAt, messageId: row.messageId };
        bytes += row.byteSize;
        scanned++;
        cursor = await cursor.continue();
      }
      if (!cursor) job.stage = "drain-index";
      await tx.objectStore("localMailEvictionJobs").put(job);
      if (!isEmailCacheEpochCurrent(options.emailAccountId, epoch))
        throw new Error("Local mail cache was cleared");
      await tx.done;
      notifyEmailCacheChange(options.emailAccountId);
      return job;
    } catch (error) {
      try {
        tx.abort();
      } catch {}
      await tx.done.catch(() => undefined);
      throw error;
    }
  });
}

export async function updateLocalMailThreadProtection(
  options: Options & {
    threadId: string;
    now: number;
    recentlyOpenedUntil?: number;
    reservation?: { id: string; bytes: number; expiresAt: number };
  },
) {
  const { reservation } = options;
  if (
    !options.threadId ||
    !Number.isSafeInteger(options.now) ||
    (options.recentlyOpenedUntil !== undefined &&
      !Number.isSafeInteger(options.recentlyOpenedUntil)) ||
    (reservation &&
      (!reservation.id ||
        !Number.isSafeInteger(reservation.bytes) ||
        reservation.bytes < 0 ||
        !Number.isSafeInteger(reservation.expiresAt)))
  )
    throw new Error("Invalid local mail protection");
  const epoch = captureEmailCacheEpoch(options.emailAccountId);
  return (options.withStorageLock ?? withLocalMailStorageLock)(async () => {
    const db = await getEmailCacheDatabase();
    if (!db || !isEmailCacheEpochCurrent(options.emailAccountId, epoch))
      return false;
    const tx = await createAccountedMailTransaction(db, [
      "searchIndexAccounts",
      "localMailThreadProtection",
    ]);
    const account = await tx
      .objectStore("searchIndexAccounts")
      .get(options.emailAccountId);
    if (account?.generation !== options.generation) {
      await tx.done;
      return false;
    }
    const store = tx.objectStore("localMailThreadProtection");
    const key: [string, string] = [options.emailAccountId, options.threadId];
    const previous = await store.get(key);
    const current: LocalMailThreadProtection =
      previous?.generation === options.generation
        ? previous
        : {
            emailAccountId: options.emailAccountId,
            threadId: options.threadId,
            generation: options.generation,
          };
    const reservations = Object.fromEntries(
      Object.entries(current.reservations ?? {}).filter(
        ([, value]) => value.expiresAt > options.now,
      ),
    );
    if (reservation) {
      if (reservation.bytes > 0 && reservation.expiresAt > options.now)
        reservations[reservation.id] = {
          bytes: reservation.bytes,
          expiresAt: reservation.expiresAt,
        };
      else delete reservations[reservation.id];
    }
    await store.put({
      ...current,
      reservations,
      recentlyOpenedUntil:
        options.recentlyOpenedUntil === undefined
          ? current.recentlyOpenedUntil
          : Math.max(
              current.recentlyOpenedUntil ?? 0,
              options.recentlyOpenedUntil,
            ),
    });
    if (!isEmailCacheEpochCurrent(options.emailAccountId, epoch)) {
      tx.abort();
      await tx.done.catch(() => undefined);
      return false;
    }
    await tx.done;
    return true;
  });
}
