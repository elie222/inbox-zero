import { getEmailCacheDatabase } from "./database";
import {
  EMAIL_CACHE_CLEANUP_INTERVAL_MS,
  EMAIL_CACHE_DEFAULT_DETAIL_BUDGET_BYTES,
  EMAIL_CACHE_MAX_AGE_MS,
  EMAIL_CACHE_MAX_DETAIL_BUDGET_BYTES,
  EMAIL_CACHE_MAX_VIEWS_PER_ACCOUNT,
} from "./policy";

let lastCleanupAt = 0;
let cleanupScheduled = false;

export function scheduleEmailCacheCleanup({ force = false } = {}) {
  if (typeof window === "undefined" || cleanupScheduled) return;
  if (!force && Date.now() - lastCleanupAt < EMAIL_CACHE_CLEANUP_INTERVAL_MS) {
    return;
  }
  cleanupScheduled = true;

  const run = () => {
    cleanupScheduled = false;
    lastCleanupAt = Date.now();
    cleanupEmailCache().catch(() => {});
  };

  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(run, { timeout: 5000 });
  } else {
    setTimeout(run, 1000);
  }
}

async function cleanupEmailCache() {
  try {
    const [database, storageEstimate] = await Promise.all([
      getEmailCacheDatabase(),
      navigator.storage?.estimate?.(),
    ]);
    if (!database) return;

    const now = Date.now();
    const detailBudget = storageEstimate?.quota
      ? Math.min(
          EMAIL_CACHE_MAX_DETAIL_BUDGET_BYTES,
          storageEstimate.quota * 0.1,
        )
      : EMAIL_CACHE_DEFAULT_DETAIL_BUDGET_BYTES;
    const transaction = database.transaction(
      ["threadRows", "threadViews", "threadDetails", "mailboxMessages"],
      "readwrite",
    );
    const detailsStore = transaction.objectStore("threadDetails");
    const viewsStore = transaction.objectStore("threadViews");
    const rowsStore = transaction.objectStore("threadRows");
    const mailboxMessagesStore = transaction.objectStore("mailboxMessages");
    let retainedBytes = 0;
    let detailCursor = await detailsStore
      .index("byLastAccessed")
      .openCursor(null, "prev");
    while (detailCursor) {
      const detail = detailCursor.value;
      if (
        now - detail.fetchedAt > EMAIL_CACHE_MAX_AGE_MS ||
        retainedBytes + detail.byteSize > detailBudget
      ) {
        await detailCursor.delete();
      } else {
        retainedBytes += detail.byteSize;
      }
      detailCursor = await detailCursor.continue();
    }

    const retainedViewCounts = new Map<string, number>();
    const referencedRows = new Set<string>();
    let viewCursor = await viewsStore
      .index("byLastAccessed")
      .openCursor(null, "prev");
    while (viewCursor) {
      const view = viewCursor.value;
      const retainedCount = retainedViewCounts.get(view.emailAccountId) ?? 0;
      if (
        now - view.fetchedAt > EMAIL_CACHE_MAX_AGE_MS ||
        retainedCount >= EMAIL_CACHE_MAX_VIEWS_PER_ACCOUNT
      ) {
        await viewCursor.delete();
      } else {
        retainedViewCounts.set(view.emailAccountId, retainedCount + 1);
        for (const threadId of view.threadIds) {
          referencedRows.add(`${view.emailAccountId}:${threadId}`);
        }
      }
      viewCursor = await viewCursor.continue();
    }

    let rowCursor = await rowsStore.openCursor();
    while (rowCursor) {
      const row = rowCursor.value;
      if (
        !referencedRows.has(`${row.emailAccountId}:${row.threadId}`) &&
        now - row.lastAccessedAt > EMAIL_CACHE_MAX_AGE_MS
      ) {
        await rowCursor.delete();
      }
      rowCursor = await rowCursor.continue();
    }

    let mailboxMessageCursor = await mailboxMessagesStore
      .index("byReceivedAt")
      .openCursor(IDBKeyRange.upperBound(now - EMAIL_CACHE_MAX_AGE_MS, true));
    while (mailboxMessageCursor) {
      await mailboxMessageCursor.delete();
      mailboxMessageCursor = await mailboxMessageCursor.continue();
    }

    await transaction.done;
  } catch {
    // Cleanup is opportunistic and should not interfere with foreground work.
  }
}
