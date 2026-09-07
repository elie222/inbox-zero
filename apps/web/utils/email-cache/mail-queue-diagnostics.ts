import {
  captureEmailCacheEpoch,
  getEmailCacheDatabase,
  isEmailCacheEpochCurrent,
  type CachedMailboxSyncState,
  type StoredMailMutation,
} from "./database";
import { isActiveMailMutationStatus } from "./mail-mutations";

export async function readMailQueueDiagnostics({
  emailAccountId,
  filter,
  limit,
}: {
  emailAccountId: string;
  filter: string;
  limit: number;
}) {
  const empty = {
    mutations: [] as Omit<
      StoredMailMutation,
      "payload" | "clientSource" | "result"
    >[],
    counts: {} as Partial<Record<StoredMailMutation["status"], number>>,
    total: 0,
    matchingCount: 0,
    activeCount: 0,
    activeBatchCount: 0,
    activeMessageCount: 0,
    sync: undefined as CachedMailboxSyncState | undefined,
  };
  const epoch = captureEmailCacheEpoch(emailAccountId);
  if (!epoch) return empty;
  const database = await getEmailCacheDatabase();
  if (!database)
    throw new Error("Local mail storage is unavailable in this browser.");
  const snapshot = {
    ...empty,
    counts: { ...empty.counts },
    mutations: [...empty.mutations],
  };
  const batches = new Set<string>();
  let before: [string, number, string] | undefined;
  let complete = false;
  while (!complete) {
    const transaction = database.transaction(
      ["mailMutations", "mailboxSyncStates"],
      "readonly",
    );
    const store = transaction.objectStore("mailMutations");
    if (!before)
      snapshot.sync = await transaction
        .objectStore("mailboxSyncStates")
        .get(emailAccountId);
    // Short transactions let queued claims and lease renewals run between batches.
    let cursor = await store
      .index("byAccountDiagnostics")
      .openKeyCursor(
        IDBKeyRange.bound(
          [emailAccountId],
          before ?? [emailAccountId, []],
          false,
          true,
        ),
        "prev",
      );
    let scanned = 0;
    while (cursor && scanned < 100) {
      const [, createdAt, id, status, batchId, messageIds] = cursor.key;
      before = [emailAccountId, createdAt, id];
      scanned += 1;
      snapshot.total += 1;
      snapshot.counts[status] = (snapshot.counts[status] ?? 0) + 1;
      const active = isActiveMailMutationStatus(status);
      if (active) {
        snapshot.activeCount += 1;
        snapshot.activeMessageCount += messageIds.length;
        batches.add(batchId);
      }
      if (
        filter === "all" ||
        filter === status ||
        (filter === "active" && active)
      ) {
        snapshot.matchingCount += 1;
        if (snapshot.mutations.length < limit) {
          const record = await store.get(cursor.primaryKey);
          if (record) {
            const { payload, clientSource, result, ...metadata } = record;
            snapshot.mutations.push(metadata);
          }
        }
      }
      cursor = await cursor.continue();
    }
    complete = !cursor;
    await transaction.done;
    if (!isEmailCacheEpochCurrent(emailAccountId, epoch)) return empty;
  }
  snapshot.activeBatchCount = batches.size;
  return snapshot;
}
