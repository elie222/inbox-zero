import type { IDBPTransaction, StoreNames } from "idb";
import { randomUuid } from "@/utils/uuid";
import {
  getEmailCacheDatabase,
  invalidateEmailCacheAccountEpoch,
  type EmailCacheSchema,
} from "./database";
import { notifyEmailCacheChange } from "./cache-events";
import { isMailSyncActivated } from "./mail-activation";
import { createAccountedMailTransaction } from "./optional-cache-write";
import { runLocalMailEvictionBatch } from "./local-mail-retention";
import { withLocalMailStorageLock } from "./local-mail-storage";
import { createSearchIndexClient } from "./search-index-client";
import { LOCAL_MAIL_HISTORY_AFTER } from "./local-mail-sync-state";

type Store = StoreNames<EmailCacheSchema>;
type Transaction = IDBPTransaction<EmailCacheSchema, Store[], "readwrite">;
const downloadedStores = [
  "threadRows",
  "threadViews",
  "threadDetails",
  "mailboxMessages",
  "localMailTombstones",
  "localMailEvictedMessages",
  "localMailAttachmentFiles",
  "localMailAttachmentJobs",
  "localMailThreadProtection",
  "localMailSyncJobs",
  "localMailSyncSeen",
  "searchIndexWork",
] as const;
const stores: Store[] = [
  ...downloadedStores,
  "replyDrafts",
  "mailMutations",
  "localMailMessages",
  "searchIndexAccounts",
  "localMailSyncStates",
  "localMailRetentionPolicies",
  "localMailEvictionJobs",
  "mailboxSyncStates",
  "mailboxSyncJobs",
];

/** Performs one resumable batch; callers must keep downloading disabled until completion. */
export async function clearLocalMailDownloads(options: {
  emailAccountId: string;
  generation: string;
  now?: number;
  limit?: number;
  withStorageLock?: typeof withLocalMailStorageLock;
}) {
  const { emailAccountId, generation } = options;
  const now = options.now ?? Date.now();
  const limit = options.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 100)
    throw new Error("Invalid clear batch size");
  const lock = options.withStorageLock ?? withLocalMailStorageLock;
  const result = await lock(async () => {
    if (isMailSyncActivated(emailAccountId)) return blocked("sync-enabled");
    const db = await getEmailCacheDatabase();
    if (!db) return blocked("unavailable");
    const tx = await createAccountedMailTransaction(db, stores);
    try {
      const account = await tx
        .objectStore("searchIndexAccounts")
        .get(emailAccountId);
      const job = await tx
        .objectStore("localMailEvictionJobs")
        .get(emailAccountId);
      if (
        !account ||
        (account.generation !== generation &&
          job?.cleanupGeneration !== generation)
      )
        return await finish(blocked("stale-generation"));
      if (job && job.kind !== "clear-downloads")
        return await finish(blocked("eviction-pending"));
      const reason = await protectedWork(tx, emailAccountId, now);
      if (reason) return await finish(blocked(reason));
      if (job?.cleanupGeneration)
        return await finish({
          status: "cleanup-index" as const,
          generation: job.generation,
          oldGeneration: job.cleanupGeneration,
        });
      if (!job) {
        const revision = (account.retentionRevision ?? 0) + 1;
        const policy = await tx
          .objectStore("localMailRetentionPolicies")
          .get(emailAccountId);
        await tx.objectStore("localMailRetentionPolicies").put({
          emailAccountId,
          generation,
          requestedAfter: policy?.requestedAfter ?? LOCAL_MAIL_HISTORY_AFTER,
          automaticAfter: policy?.automaticAfter ?? LOCAL_MAIL_HISTORY_AFTER,
          revision,
        });
        await tx
          .objectStore("searchIndexAccounts")
          .put({ ...account, retentionRevision: revision });
        const sync = await tx
          .objectStore("localMailSyncStates")
          .get(emailAccountId);
        if (sync)
          await tx.objectStore("localMailSyncStates").put({
            ...sync,
            coverage: undefined,
            fence: sync.fence + 1,
            leaseOwner: undefined,
            leaseExpiresAt: undefined,
            nextAttemptAt: Number.MAX_SAFE_INTEGER,
            retentionRevision: revision,
          });
        await tx.objectStore("localMailEvictionJobs").put({
          emailAccountId,
          generation,
          kind: "clear-downloads",
          revision,
          after: -Number.MAX_SAFE_INTEGER,
          before: Number.MAX_SAFE_INTEGER,
          startedAt: now,
          protectedRecentAfter: Number.MAX_SAFE_INTEGER,
          protectedFetchedAfter: Number.MAX_SAFE_INTEGER,
          stage: "remove-source",
          removedBytes: 0,
        });
        invalidateEmailCacheAccountEpoch(emailAccountId);
        return await finish({ status: "progress" as const });
      }
      if (job.stage === "remove-source")
        return await finish({
          status: "remove-source" as const,
          revision: job.revision,
        });
      if (
        await tx
          .objectStore("localMailMessages")
          .index("byAccount")
          .count(emailAccountId)
      )
        return await finish(blocked("protected-mail"));
      const range = IDBKeyRange.bound(
        [emailAccountId, ""],
        [emailAccountId, []],
      );
      for (const name of downloadedStores) {
        const store = tx.objectStore(name);
        const keys = await store.getAllKeys(range, limit);
        for (const key of keys) await store.delete(key as never);
        if (keys.length) return await finish({ status: "progress" as const });
      }
      const nextGeneration = randomUuid();
      await tx.objectStore("searchIndexAccounts").put({
        emailAccountId,
        generation: nextGeneration,
        messageBytes: 0,
        attachmentBytes: 0,
        evictionMarkerBytes: 0,
      });
      await tx.objectStore("localMailSyncStates").delete(emailAccountId);
      await tx.objectStore("mailboxSyncStates").delete(emailAccountId);
      await tx.objectStore("mailboxSyncJobs").delete(emailAccountId);
      await tx.objectStore("localMailRetentionPolicies").delete(emailAccountId);
      await tx.objectStore("localMailEvictionJobs").put({
        ...job,
        generation: nextGeneration,
        cleanupGeneration: generation,
      });
      invalidateEmailCacheAccountEpoch(emailAccountId);
      return await finish({
        status: "cleanup-index" as const,
        generation: nextGeneration,
        oldGeneration: generation,
      });
      async function finish<T>(value: T) {
        await tx.done;
        return value;
      }
    } catch (error) {
      try {
        tx.abort();
      } catch {}
      await tx.done.catch(() => undefined);
      throw error;
    }
  });
  notifyEmailCacheChange(emailAccountId);
  if (result.status === "remove-source") {
    await runLocalMailEvictionBatch({
      ...options,
      now,
      limit,
      revision: result.revision,
    });
    return { status: "progress" as const };
  }
  if (result.status !== "cleanup-index") return result;
  const client = createSearchIndexClient();
  try {
    const response = await client.cleanupAccount({
      emailAccountId,
      generation: result.oldGeneration,
    });
    if (!("result" in response) || response.result !== true)
      return blocked("index-unavailable");
  } catch {
    return blocked("index-unavailable");
  } finally {
    client.close();
  }
  return lock(async () => {
    const db = await getEmailCacheDatabase();
    if (!db) return blocked("unavailable");
    const tx = await createAccountedMailTransaction(db, [
      "localMailEvictionJobs",
      "searchIndexAccounts",
    ]);
    const job = await tx
      .objectStore("localMailEvictionJobs")
      .get(emailAccountId);
    const account = await tx
      .objectStore("searchIndexAccounts")
      .get(emailAccountId);
    if (
      job?.cleanupGeneration !== result.oldGeneration ||
      account?.generation !== result.generation
    ) {
      await tx.done;
      return blocked("stale-generation");
    }
    await tx.objectStore("localMailEvictionJobs").delete(emailAccountId);
    await tx.done;
    notifyEmailCacheChange(emailAccountId);
    return { status: "cleared" as const };
  });
}

function blocked(reason: string) {
  return { status: "blocked" as const, reason };
}
async function protectedWork(
  tx: Transaction,
  emailAccountId: string,
  now: number,
) {
  for (const name of ["replyDrafts", "mailMutations"] as const) {
    let cursor = await tx
      .objectStore(name)
      .index("byAccount")
      .openCursor(emailAccountId);
    while (cursor) {
      const value = cursor.value;
      if (
        ("content" in value && value.content !== null) ||
        ("status" in value && value.status !== "succeeded")
      )
        return name === "replyDrafts" ? "drafts" : "queued-actions";
      cursor = await cursor.continue();
    }
  }
  let cursor = await tx
    .objectStore("localMailThreadProtection")
    .openCursor(IDBKeyRange.bound([emailAccountId, ""], [emailAccountId, []]));
  while (cursor) {
    if (cursor.value.pinned) return "pinned-mail";
    if (
      Object.values(cursor.value.reservations ?? {}).some(
        (value) => value.bytes > 0 && value.expiresAt > now,
      )
    )
      return "active-downloads";
    cursor = await cursor.continue();
  }
}
