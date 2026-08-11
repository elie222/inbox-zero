import { scheduleEmailCacheCleanup } from "./cleanup";
import {
  captureEmailCacheEpoch,
  getEmailCacheDatabase,
  isEmailCacheEpochCurrent,
} from "./database";
import { EMAIL_CACHE_MAX_AGE_MS } from "./policy";

export async function writeCachedThread<T>({
  emailAccountId,
  threadId,
  variant,
  data,
  now = Date.now(),
}: {
  emailAccountId: string;
  threadId: string;
  variant: string;
  data: T;
  now?: number;
}) {
  const epoch = captureEmailCacheEpoch(emailAccountId);

  try {
    const database = await getEmailCacheDatabase();
    if (!database || !isEmailCacheEpochCurrent(emailAccountId, epoch)) return;
    await database.put("threadDetails", {
      emailAccountId,
      threadId,
      variant,
      data,
      fetchedAt: now,
      lastAccessedAt: now,
      byteSize: new Blob([JSON.stringify(data)]).size,
    });
    scheduleEmailCacheCleanup();
  } catch {
    scheduleEmailCacheCleanup({ force: true });
    // Cache writes are best-effort and must never affect thread rendering.
  }
}

export async function readCachedThread<T>({
  emailAccountId,
  threadId,
  variant,
}: {
  emailAccountId: string;
  threadId: string;
  variant: string;
}) {
  const epoch = captureEmailCacheEpoch(emailAccountId);

  try {
    const database = await getEmailCacheDatabase();
    if (!database || !isEmailCacheEpochCurrent(emailAccountId, epoch)) return;
    const transaction = database.transaction("threadDetails", "readwrite");
    const store = transaction.objectStore("threadDetails");
    const record = await store.get([emailAccountId, threadId, variant]);
    if (!record) {
      await transaction.done;
      return;
    }
    if (Date.now() - record.fetchedAt > EMAIL_CACHE_MAX_AGE_MS) {
      await transaction.done;
      scheduleEmailCacheCleanup();
      return;
    }

    await store.put({ ...record, lastAccessedAt: Date.now() });
    await transaction.done;
    scheduleEmailCacheCleanup();
    return {
      data: record.data as T,
      cachedAt: record.fetchedAt,
      byteSize: record.byteSize,
    };
  } catch {
    return;
  }
}
