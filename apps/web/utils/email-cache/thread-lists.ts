import { scheduleEmailCacheCleanup } from "./cleanup";
import {
  captureEmailCacheEpoch,
  getEmailCacheDatabase,
  isEmailCacheEpochCurrent,
} from "./database";
import { EMAIL_CACHE_MAX_AGE_MS } from "./policy";
import { restoreThreadOrder, type ThreadRestorePosition } from "./thread-order";

type ThreadRow = { id: string };

export async function writeCachedThreadList<T extends ThreadRow>({
  emailAccountId,
  viewKey,
  threads,
  hasMore,
  now = Date.now(),
}: {
  emailAccountId: string;
  viewKey: string;
  threads: T[];
  hasMore: boolean;
  now?: number;
}) {
  const epoch = captureEmailCacheEpoch(emailAccountId);

  try {
    const database = await getEmailCacheDatabase();
    if (!database || !isEmailCacheEpochCurrent(emailAccountId, epoch)) return;
    const transaction = database.transaction(
      ["threadRows", "threadViews"],
      "readwrite",
    );

    await Promise.all([
      ...threads.map((thread) =>
        transaction.objectStore("threadRows").put({
          emailAccountId,
          threadId: thread.id,
          data: thread,
          fetchedAt: now,
          lastAccessedAt: now,
        }),
      ),
      transaction.objectStore("threadViews").put({
        emailAccountId,
        viewKey,
        threadIds: threads.map((thread) => thread.id),
        hasMore,
        fetchedAt: now,
        lastAccessedAt: now,
      }),
    ]);
    await transaction.done;
    scheduleEmailCacheCleanup();
  } catch {
    scheduleEmailCacheCleanup({ force: true });
    // Cache writes are best-effort and must never affect the network response.
  }
}

export async function readCachedThreadList<T extends ThreadRow>({
  emailAccountId,
  viewKey,
}: {
  emailAccountId: string;
  viewKey: string;
}) {
  const epoch = captureEmailCacheEpoch(emailAccountId);

  try {
    const database = await getEmailCacheDatabase();
    if (!database || !isEmailCacheEpochCurrent(emailAccountId, epoch)) return;
    const transaction = database.transaction(
      ["threadRows", "threadViews"],
      "readwrite",
    );
    const views = transaction.objectStore("threadViews");
    const rowsStore = transaction.objectStore("threadRows");
    const view = await views.get([emailAccountId, viewKey]);
    if (!view) {
      await transaction.done;
      return;
    }
    if (Date.now() - view.fetchedAt > EMAIL_CACHE_MAX_AGE_MS) {
      await transaction.done;
      scheduleEmailCacheCleanup();
      return;
    }

    const rows = await Promise.all(
      view.threadIds.map((threadId) =>
        rowsStore.get([emailAccountId, threadId]),
      ),
    );
    await views.put({ ...view, lastAccessedAt: Date.now() });
    await transaction.done;
    if (!isEmailCacheEpochCurrent(emailAccountId, epoch)) return;
    scheduleEmailCacheCleanup();

    return {
      cachedAt: view.fetchedAt,
      hasMore: view.hasMore,
      threads: rows
        .filter((row) => row !== undefined)
        .map((row) => row.data as T),
    };
  } catch {
    return;
  }
}

export async function removeCachedThreadsFromView({
  emailAccountId,
  viewKey,
  threadIds,
}: {
  emailAccountId: string;
  viewKey: string;
  threadIds: string[];
}) {
  const epoch = captureEmailCacheEpoch(emailAccountId);

  try {
    const database = await getEmailCacheDatabase();
    if (!database || !isEmailCacheEpochCurrent(emailAccountId, epoch)) return;
    const transaction = database.transaction("threadViews", "readwrite");
    const store = transaction.objectStore("threadViews");
    const view = await store.get([emailAccountId, viewKey]);
    if (!view) return;

    const removed = new Set(threadIds);
    await store.put({
      ...view,
      threadIds: view.threadIds.filter((threadId) => !removed.has(threadId)),
      lastAccessedAt: Date.now(),
    });
    await transaction.done;
  } catch {
    // Optimistic UI state remains authoritative if persistence is unavailable.
  }
}

export async function restoreCachedThreadsToView<T extends ThreadRow>({
  emailAccountId,
  viewKey,
  entries,
}: {
  emailAccountId: string;
  viewKey: string;
  entries: Array<{ thread: T } & Omit<ThreadRestorePosition, "threadId">>;
}) {
  const epoch = captureEmailCacheEpoch(emailAccountId);

  try {
    const database = await getEmailCacheDatabase();
    if (!database || !isEmailCacheEpochCurrent(emailAccountId, epoch)) return;
    const transaction = database.transaction(
      ["threadRows", "threadViews"],
      "readwrite",
    );
    const views = transaction.objectStore("threadViews");
    const view = await views.get([emailAccountId, viewKey]);
    if (!view) return;

    const now = Date.now();
    const threadIds = restoreThreadOrder(
      view.threadIds,
      entries.map((entry) => ({
        threadId: entry.thread.id,
        index: entry.index,
        threadOrder: entry.threadOrder,
      })),
    );
    for (const entry of entries) {
      await transaction.objectStore("threadRows").put({
        emailAccountId,
        threadId: entry.thread.id,
        data: entry.thread,
        fetchedAt: now,
        lastAccessedAt: now,
      });
    }
    await views.put({ ...view, threadIds, lastAccessedAt: now });
    await transaction.done;
  } catch {
    // Optimistic UI state remains authoritative if persistence is unavailable.
  }
}
