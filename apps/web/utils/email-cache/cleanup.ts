import { createAccountedMailTransaction } from "./optional-cache-write";
import { markSearchThreadsDirty } from "./search-index-work";
import { getEmailCacheDatabase } from "./database";
import {
  EMAIL_CACHE_CLEANUP_INTERVAL_MS,
  EMAIL_CACHE_DEFAULT_DETAIL_BUDGET_BYTES,
  EMAIL_CACHE_MAILBOX_MAX_AGE_MS,
  EMAIL_CACHE_MAX_AGE_MS,
  EMAIL_CACHE_MAX_DETAIL_BUDGET_BYTES,
  EMAIL_CACHE_MAX_VIEWS_PER_ACCOUNT,
  MAIL_MUTATION_RETRY_WINDOW_MS,
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
    const transaction = await createAccountedMailTransaction(database, [
      "threadRows",
      "threadViews",
      "threadDetails",
      "mailboxMessages",
      "mailMutations",
      "searchIndexAccounts",
      "searchIndexWork",
    ]);
    const detailsStore = transaction.objectStore("threadDetails");
    const viewsStore = transaction.objectStore("threadViews");
    const rowsStore = transaction.objectStore("threadRows");
    const mailboxMessagesStore = transaction.objectStore("mailboxMessages");
    const mailMutationsStore = transaction.objectStore("mailMutations");
    const dirtyThreads = new Map<string, Set<string>>();
    const recordDirtyThread = (emailAccountId: string, threadId: string) => {
      const threads = dirtyThreads.get(emailAccountId) ?? new Set<string>();
      threads.add(threadId);
      dirtyThreads.set(emailAccountId, threads);
    };
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
        recordDirtyThread(detail.emailAccountId, detail.threadId);
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
        recordDirtyThread(row.emailAccountId, row.threadId);
        await rowCursor.delete();
      }
      rowCursor = await rowCursor.continue();
    }

    const retainedAccounts = new Set(
      (await transaction.objectStore("searchIndexAccounts").getAll())
        .filter((account) => (account.sourceVersion ?? 0) >= 2)
        .map((account) => account.emailAccountId),
    );
    let mailboxAccount = await mailboxMessagesStore
      .index("byAccount")
      .openKeyCursor(null, "nextunique");
    while (mailboxAccount) {
      // Canonical retention owns both full messages and their compact projection.
      // Skip whole retained accounts rather than scanning years of metadata hourly.
      if (!retainedAccounts.has(mailboxAccount.key)) {
        let messageCursor = await mailboxMessagesStore
          .index("byAccountReceivedAt")
          .openCursor(
            IDBKeyRange.bound(
              [mailboxAccount.key, -Number.MAX_VALUE],
              [mailboxAccount.key, now - EMAIL_CACHE_MAILBOX_MAX_AGE_MS],
              false,
              true,
            ),
          );
        while (messageCursor) {
          const message = messageCursor.value;
          recordDirtyThread(message.emailAccountId, message.threadId);
          await messageCursor.delete();
          messageCursor = await messageCursor.continue();
        }
      }
      mailboxAccount = await mailboxAccount.continue();
    }

    let mutationCursor = await mailMutationsStore
      .index("byUpdatedAt")
      .openCursor(
        IDBKeyRange.upperBound(now - MAIL_MUTATION_RETRY_WINDOW_MS, true),
      );
    while (mutationCursor) {
      if (
        mutationCursor.value.status === "succeeded" ||
        mutationCursor.value.status === "failed" ||
        mutationCursor.value.status === "uncertain"
      ) {
        await mutationCursor.delete();
      }
      mutationCursor = await mutationCursor.continue();
    }

    await Promise.all(
      [...dirtyThreads].map(([emailAccountId, threadIds]) =>
        markSearchThreadsDirty(transaction, emailAccountId, threadIds),
      ),
    );
    await transaction.done;
  } catch {
    // Cleanup is opportunistic and should not interfere with foreground work.
  }
}
