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

export function scheduleEmailCacheCleanup() {
  if (typeof window === "undefined" || cleanupScheduled) return;
  if (Date.now() - lastCleanupAt < EMAIL_CACHE_CLEANUP_INTERVAL_MS) return;
  cleanupScheduled = true;

  const run = () => {
    cleanupScheduled = false;
    lastCleanupAt = Date.now();
    cleanupEmailCache().catch(() => {});
  };

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(run, { timeout: 5000 });
  } else {
    window.setTimeout(run, 1000);
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
      ["threadRows", "threadViews", "threadDetails"],
      "readwrite",
    );
    const detailsStore = transaction.objectStore("threadDetails");
    const viewsStore = transaction.objectStore("threadViews");
    const rowsStore = transaction.objectStore("threadRows");
    const [details, views, rows] = await Promise.all([
      detailsStore.getAll(),
      viewsStore.getAll(),
      rowsStore.getAll(),
    ]);

    const retainedDetails = details
      .filter((detail) => now - detail.fetchedAt <= EMAIL_CACHE_MAX_AGE_MS)
      .sort((first, second) => second.lastAccessedAt - first.lastAccessedAt);
    let retainedBytes = 0;
    const retainedDetailKeys = new Set<string>();
    for (const detail of retainedDetails) {
      if (retainedBytes + detail.byteSize > detailBudget) continue;
      retainedBytes += detail.byteSize;
      retainedDetailKeys.add(detailKey(detail));
    }
    await Promise.all(
      details
        .filter((detail) => !retainedDetailKeys.has(detailKey(detail)))
        .map((detail) =>
          detailsStore.delete([
            detail.emailAccountId,
            detail.threadId,
            detail.variant,
          ]),
        ),
    );

    const viewsByAccount = new Map<string, typeof views>();
    for (const view of views) {
      if (now - view.fetchedAt > EMAIL_CACHE_MAX_AGE_MS) continue;
      const accountViews = viewsByAccount.get(view.emailAccountId) ?? [];
      accountViews.push(view);
      viewsByAccount.set(view.emailAccountId, accountViews);
    }
    const retainedViewKeys = new Set<string>();
    const referencedRows = new Set<string>();
    for (const accountViews of viewsByAccount.values()) {
      for (const view of accountViews
        .sort((first, second) => second.lastAccessedAt - first.lastAccessedAt)
        .slice(0, EMAIL_CACHE_MAX_VIEWS_PER_ACCOUNT)) {
        retainedViewKeys.add(viewKey(view));
        for (const threadId of view.threadIds) {
          referencedRows.add(`${view.emailAccountId}:${threadId}`);
        }
      }
    }
    await Promise.all(
      views
        .filter((view) => !retainedViewKeys.has(viewKey(view)))
        .map((view) => viewsStore.delete([view.emailAccountId, view.viewKey])),
    );
    await Promise.all(
      rows
        .filter(
          (row) =>
            !referencedRows.has(`${row.emailAccountId}:${row.threadId}`) &&
            now - row.lastAccessedAt > EMAIL_CACHE_MAX_AGE_MS,
        )
        .map((row) => rowsStore.delete([row.emailAccountId, row.threadId])),
    );

    await transaction.done;
  } catch {
    // Cleanup is opportunistic and should not interfere with foreground work.
  }
}

function detailKey(detail: {
  emailAccountId: string;
  threadId: string;
  variant: string;
}) {
  return `${detail.emailAccountId}:${detail.threadId}:${detail.variant}`;
}

function viewKey(view: { emailAccountId: string; viewKey: string }) {
  return `${view.emailAccountId}:${view.viewKey}`;
}
