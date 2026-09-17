import {
  withOptionalMailCacheWrite,
  createAccountedMailTransaction,
} from "./optional-cache-write";
import {
  isLocalMailCacheContextCurrent,
  canPersistLocalMailSnapshot,
  type LocalMailCacheContext,
} from "./local-mail-cache-context";
import { storeLocalMailMessages } from "./local-mail-messages";
import type { SearchMessage } from "./search-query";
import { markSearchThreadsDirty } from "./search-index-work";
import { notifyEmailCacheChange } from "./cache-events";
import { scheduleEmailCacheCleanup } from "./cleanup";
import {
  captureEmailCacheEpoch,
  getEmailCacheDatabase,
  isEmailCacheEpochCurrent,
} from "./database";
import { EMAIL_CACHE_MAX_AGE_MS } from "./policy";

type ThreadRow = { id: string; messages?: SearchMessage[] };

export async function writeCachedThreadRows<T extends ThreadRow>({
  emailAccountId,
  threads,
  fetchedAt,
  cacheContext,
  now = Date.now(),
}: {
  emailAccountId: string;
  threads: T[];
  fetchedAt?: number;
  now?: number;
  cacheContext?: LocalMailCacheContext;
}) {
  if (!threads.length) return;
  const epoch = captureEmailCacheEpoch(emailAccountId);

  try {
    const database = await getEmailCacheDatabase();
    if (!database || !isEmailCacheEpochCurrent(emailAccountId, epoch)) return;
    return await withOptionalMailCacheWrite(
      database,
      [
        "threadRows",
        "searchIndexAccounts",
        "searchIndexWork",
        "mailboxMessages",
        "localMailMessages",
        "localMailTombstones",
        "localMailRetentionPolicies",
        "localMailEvictedMessages",

        "localMailAttachmentFiles",
        "localMailAttachmentJobs",
        "localMailThreadProtection",
      ],
      async (transaction) => {
        if (
          !(await isLocalMailCacheContextCurrent(
            transaction,
            emailAccountId,
            cacheContext,
          ))
        ) {
          await transaction.done;
          return;
        }
        const store = transaction.objectStore("threadRows");

        const changedThreadIds: string[] = [];
        for (const thread of threads) {
          if (
            !(await canPersistLocalMailSnapshot(
              transaction,
              emailAccountId,
              thread.messages,
            ))
          )
            continue;
          const current = await store.get([emailAccountId, thread.id]);
          if (
            fetchedAt !== undefined &&
            current &&
            current.fetchedAt > fetchedAt
          )
            continue;
          if (fetchedAt !== undefined && Array.isArray(thread.messages)) {
            await storeLocalMailMessages(
              transaction,
              emailAccountId,
              thread.messages,
              fetchedAt ?? current?.fetchedAt ?? now,
              {
                retention:
                  cacheContext?.revision === undefined
                    ? undefined
                    : { revision: cacheContext.revision, purpose: "cache" },
              },
            );
          }
          if (fetchedAt !== undefined) changedThreadIds.push(thread.id);
          await store.put({
            emailAccountId,
            threadId: thread.id,
            data: thread,
            fetchedAt: fetchedAt ?? current?.fetchedAt ?? now,
            lastAccessedAt: now,
          });
        }
        await markSearchThreadsDirty(
          transaction,
          emailAccountId,
          changedThreadIds,
        );
        await transaction.done;
        notifyEmailCacheChange(emailAccountId);
        scheduleEmailCacheCleanup();
      },
    );
  } catch {
    scheduleEmailCacheCleanup({ force: true });
    // Optimistic UI state remains authoritative if persistence is unavailable.
  }
}

export async function writeCachedThreadList<T extends ThreadRow>({
  emailAccountId,
  viewKey,
  threads,
  hasMore,
  cacheContext,
  now = Date.now(),
}: {
  emailAccountId: string;
  viewKey: string;
  threads: T[];
  hasMore: boolean;
  now?: number;
  cacheContext?: LocalMailCacheContext;
}) {
  const epoch = captureEmailCacheEpoch(emailAccountId);

  try {
    const database = await getEmailCacheDatabase();
    if (!database || !isEmailCacheEpochCurrent(emailAccountId, epoch)) return;
    return await withOptionalMailCacheWrite(
      database,
      [
        "threadRows",
        "threadViews",
        "searchIndexAccounts",
        "searchIndexWork",
        "mailboxMessages",
        "localMailMessages",
        "localMailTombstones",
        "localMailRetentionPolicies",
        "localMailEvictedMessages",

        "localMailAttachmentFiles",
        "localMailAttachmentJobs",
        "localMailThreadProtection",
      ],
      async (transaction) => {
        if (
          !(await isLocalMailCacheContextCurrent(
            transaction,
            emailAccountId,
            cacheContext,
          ))
        ) {
          await transaction.done;
          return;
        }
        const views = transaction.objectStore("threadViews");
        const currentView = await views.get([emailAccountId, viewKey]);
        if (currentView && currentView.fetchedAt > now) {
          await transaction.done;
          return;
        }
        const rows = transaction.objectStore("threadRows");
        const changedThreadIds: string[] = [];
        for (const thread of threads) {
          if (
            !(await canPersistLocalMailSnapshot(
              transaction,
              emailAccountId,
              thread.messages,
            ))
          )
            continue;
          const current = await rows.get([emailAccountId, thread.id]);
          if (current && current.fetchedAt > now) continue;
          await rows.put({
            emailAccountId,
            threadId: thread.id,
            data: thread,
            fetchedAt: now,
            lastAccessedAt: now,
          });
          if (Array.isArray(thread.messages))
            await storeLocalMailMessages(
              transaction,
              emailAccountId,
              thread.messages,
              now,
              {
                retention:
                  cacheContext?.revision === undefined
                    ? undefined
                    : { revision: cacheContext.revision, purpose: "cache" },
              },
            );
          changedThreadIds.push(thread.id);
        }
        await views.put({
          emailAccountId,
          viewKey,
          threadIds: threads.map((thread) => thread.id),
          hasMore,
          fetchedAt: now,
          lastAccessedAt: now,
        });
        await markSearchThreadsDirty(
          transaction,
          emailAccountId,
          changedThreadIds,
        );
        await transaction.done;
        notifyEmailCacheChange(emailAccountId);
        scheduleEmailCacheCleanup();
      },
    );
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
    const transaction = await createAccountedMailTransaction(database, [
      "threadRows",
      "threadViews",
    ]);
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
