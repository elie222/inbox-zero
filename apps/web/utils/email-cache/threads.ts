import { getEmailCacheDatabase } from "./database";
import { scheduleEmailCacheCleanup } from "./cleanup";
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
  try {
    const database = await getEmailCacheDatabase();
    if (!database) return;
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
  try {
    const database = await getEmailCacheDatabase();
    if (!database) return;
    const record = await database.get("threadDetails", [
      emailAccountId,
      threadId,
      variant,
    ]);
    if (!record) return;
    if (Date.now() - record.fetchedAt > EMAIL_CACHE_MAX_AGE_MS) {
      scheduleEmailCacheCleanup();
      return;
    }

    database
      .put("threadDetails", {
        ...record,
        lastAccessedAt: Date.now(),
      })
      .catch(() => {});
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
