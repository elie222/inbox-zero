"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import useSWRInfinite from "swr/infinite";
import type { GetAllThreadsResponse } from "@/app/api/threads/all/route";
import { getListThreadKey } from "@/app/(app)/[emailAccountId]/mail/types";
import type { EmailLabels } from "@/providers/email-label-types";
import {
  readCombinedSyncedMailboxThreads,
  subscribeToMailboxStore,
  type SyncedCombinedMailboxSnapshot,
} from "@/utils/email-cache/mailbox";
import { createThreadListCacheKey } from "@/utils/email-cache/keys";
import {
  readCachedThreadList,
  removeCachedThreadsFromView,
  restoreCachedThreadsToView,
  writeCachedThreadList,
} from "@/utils/email-cache/thread-lists";
import { restoreThreadOrder } from "@/utils/email-cache/thread-order";
import {
  EMAIL_CACHE_MEASURES,
  finishEmailCacheMeasure,
  startEmailCacheMeasure,
} from "@/utils/email-cache/telemetry";
import { getThreadTimestamp } from "@/utils/threads/sort";
import { createSearchParams } from "@/utils/url";

type CombinedThread = GetAllThreadsResponse["threads"][number];

const COMBINED_PAGE_SIZE = 20;

type CachedCombinedThread = {
  id: string;
  thread: CombinedThread;
};

type RemovedCombinedThread = {
  thread: GetAllThreadsResponse["threads"][number];
  pageIndex: number;
  index: number;
  threadOrder: readonly string[];
};

type CombinedThreadRemoval = {
  viewIdentity: string;
  entries: Map<string, RemovedCombinedThread>;
};

type PersistentCombinedView = {
  identity: string;
  hasMore: boolean;
  threads: CombinedThread[];
};

type SyncedCombinedView = SyncedCombinedMailboxSnapshot & {
  identity: string;
};

export function useCombinedMailThreads({
  accounts,
  emailAccountId,
  enabled,
  isUnread,
}: {
  accounts: CombinedThread["account"][];
  emailAccountId: string;
  enabled: boolean;
  isUnread: boolean;
}) {
  const accountIdentity = useMemo(
    () =>
      accounts
        .map((account) => account.id)
        .sort()
        .join(":"),
    [accounts],
  );
  const viewKey = useMemo(
    () =>
      createThreadListCacheKey({
        scope: "combined",
        isUnread: isUnread || undefined,
      }),
    [isUnread],
  );
  const viewIdentity = `${emailAccountId}:${accountIdentity}:${viewKey}`;
  const getKey = useCallback(
    (pageIndex: number, previousPageData: GetAllThreadsResponse | null) => {
      if (!enabled || (previousPageData && !previousPageData.nextPageToken)) {
        return null;
      }
      const params = createSearchParams({
        limit: COMBINED_PAGE_SIZE,
        isUnread: isUnread || undefined,
        cursor: pageIndex > 0 ? previousPageData?.nextPageToken : undefined,
      });
      return `/api/threads/all?${params.toString()}`;
    },
    [enabled, isUnread],
  );
  const { data, error, isLoading, size, setSize, mutate } =
    useSWRInfinite<GetAllThreadsResponse>(getKey, {
      keepPreviousData: false,
      revalidateFirstPage: false,
      revalidateOnFocus: false,
    });
  const [persistent, setPersistent] = useState<PersistentCombinedView>();
  const [synced, setSynced] = useState<SyncedCombinedView>();
  const accountsRef = useRef(accounts);
  const hiddenByView = useRef(new Map<string, Set<string>>());
  const optimisticUpdateTokens = useRef(new Map<string, symbol>());
  const [, renderHiddenChanges] = useReducer((version) => version + 1, 0);
  const remoteIdentity = useRef<string | undefined>(undefined);
  const remoteSnapshot = useRef<{
    firstPage?: GetAllThreadsResponse;
    loadedAt: number;
  }>({ loadedAt: 0 });
  const loadMoreLock = useRef(false);

  remoteIdentity.current = data?.[0] ? viewIdentity : undefined;
  accountsRef.current = accounts;
  if (data?.[0] && remoteSnapshot.current.firstPage !== data[0]) {
    remoteSnapshot.current = { firstPage: data[0], loadedAt: Date.now() };
  }

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const startedAt = startEmailCacheMeasure();

    readCachedThreadList<CachedCombinedThread>({
      emailAccountId,
      viewKey,
    }).then((cached) => {
      finishEmailCacheMeasure(EMAIL_CACHE_MEASURES.listHydration, startedAt);
      if (cancelled || !cached || remoteIdentity.current === viewIdentity) {
        return;
      }
      setPersistent({
        identity: viewIdentity,
        hasMore: cached.hasMore,
        threads: cached.threads.map((entry) => entry.thread),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [emailAccountId, enabled, viewIdentity, viewKey]);

  useEffect(() => {
    if (!enabled || !accountIdentity) return;
    let cancelled = false;
    const accountIds = new Set(
      accountsRef.current.map((account) => account.id),
    );
    const loadSyncedView = () => {
      readCombinedSyncedMailboxThreads({
        accounts: accountsRef.current,
        limit: COMBINED_PAGE_SIZE,
        query: { type: isUnread ? "unread" : "inbox" },
      }).then((snapshot) => {
        if (cancelled || !snapshot) return;
        const hidden = hiddenByView.current.get(viewIdentity);
        if (hidden?.size) {
          const snapshotThreadKeys = new Set(
            snapshot.threads.map(getListThreadKey),
          );
          const unconfirmed = new Set(
            [...hidden].filter((threadKey) =>
              snapshotThreadKeys.has(threadKey),
            ),
          );
          if (unconfirmed.size !== hidden.size) {
            hiddenByView.current.set(viewIdentity, unconfirmed);
            renderHiddenChanges();
          }
        }
        setSynced({ identity: viewIdentity, ...snapshot });
      });
    };
    const unsubscribe = subscribeToMailboxStore((changedAccountId) => {
      if (accountIds.has(changedAccountId)) loadSyncedView();
    });
    loadSyncedView();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [accountIdentity, enabled, isUnread, viewIdentity]);

  const remoteThreads = useMemo(
    () => data?.flatMap((page) => page.threads),
    [data],
  );
  const failedAccountIds = useMemo(
    () => [...new Set(data?.flatMap((page) => page.failedAccountIds) ?? [])],
    [data],
  );
  const persistentThreads =
    persistent?.identity === viewIdentity ? persistent.threads : undefined;
  const syncedView = synced?.identity === viewIdentity ? synced : undefined;
  const syncedThreads = syncedView?.threads;
  const sourceThreads = useMemo(
    () =>
      remoteThreads && syncedThreads && syncedView?.complete
        ? mergeCombinedThreads({
            accountStates: syncedView.accountStates,
            failedAccountIds,
            remoteLoadedAt: remoteSnapshot.current.loadedAt,
            remoteThreads,
            syncedThreads,
          })
        : (remoteThreads ?? syncedThreads ?? persistentThreads),
    [
      persistentThreads,
      failedAccountIds,
      remoteThreads,
      syncedThreads,
      syncedView?.accountStates,
      syncedView?.complete,
    ],
  );
  const hiddenThreadKeys =
    hiddenByView.current.get(viewIdentity) ?? EMPTY_THREAD_KEYS;
  const visibleThreadLimit = Math.max(
    COMBINED_PAGE_SIZE,
    (data?.length ?? 1) * COMBINED_PAGE_SIZE,
  );
  const threads = useMemo(() => {
    const byKey = new Map<string, GetAllThreadsResponse["threads"][number]>();
    for (const thread of sourceThreads ?? []) {
      const threadKey = getListThreadKey(thread);
      if (!hiddenThreadKeys.has(threadKey)) byKey.set(threadKey, thread);
    }
    return [...byKey.values()]
      .sort(
        (left, right) => getThreadTimestamp(right) - getThreadTimestamp(left),
      )
      .slice(0, visibleThreadLimit);
  }, [hiddenThreadKeys, sourceThreads, visibleThreadLimit]);
  const hasMore = data
    ? Boolean(data.at(-1)?.nextPageToken)
    : persistent?.identity === viewIdentity
      ? persistent.hasMore
      : Boolean(syncedView?.truncated);
  const isLoadingMore = size > 1 && !data?.[size - 1];
  const labelsByAccount = useMemo(() => {
    const merged: Record<string, EmailLabels> = {};
    for (const page of data ?? []) {
      for (const [accountId, labels] of Object.entries(page.labelsByAccount)) {
        merged[accountId] = { ...(merged[accountId] ?? {}), ...labels };
      }
    }
    return merged;
  }, [data]);
  const pageIndexByThreadKey = useMemo(() => {
    const pageIndexes = new Map<string, number>();
    for (const [pageIndex, page] of (data ?? []).entries()) {
      for (const thread of page.threads) {
        pageIndexes.set(getListThreadKey(thread), pageIndex);
      }
    }
    return pageIndexes;
  }, [data]);

  useEffect(() => {
    if (!enabled) return;
    const firstPage = data?.[0];
    if (!firstPage) return;
    writeCachedThreadList({
      emailAccountId,
      viewKey,
      threads: firstPage.threads
        .filter((thread) => !hiddenThreadKeys.has(getListThreadKey(thread)))
        .map(toCachedCombinedThread),
      hasMore: Boolean(firstPage.nextPageToken),
    }).catch(() => {});
  }, [data, emailAccountId, enabled, hiddenThreadKeys, viewKey]);

  const removeThreads = useCallback(
    (threadKeys: string[]): CombinedThreadRemoval => {
      const entries = new Map<string, RemovedCombinedThread>();
      if (!threadKeys.length) return { viewIdentity, entries };
      const targets = new Set(threadKeys);

      const alreadyHidden =
        hiddenByView.current.get(viewIdentity) ?? EMPTY_THREAD_KEYS;
      const threadOrder = (sourceThreads ?? []).map(getListThreadKey);
      for (const [index, thread] of (sourceThreads ?? []).entries()) {
        const threadKey = getListThreadKey(thread);
        if (targets.has(threadKey) && !alreadyHidden.has(threadKey)) {
          entries.set(threadKey, {
            thread,
            pageIndex: pageIndexByThreadKey.get(threadKey) ?? 0,
            index,
            threadOrder,
          });
        }
      }

      const removedKeys = [...entries.keys()];
      if (!removedKeys.length) return { viewIdentity, entries };
      hiddenByView.current.set(
        viewIdentity,
        new Set([...alreadyHidden, ...removedKeys]),
      );
      renderHiddenChanges();
      const removed = new Set(removedKeys);
      setPersistent((current) =>
        current?.identity === viewIdentity
          ? {
              ...current,
              threads: current.threads.filter(
                (thread) => !removed.has(getListThreadKey(thread)),
              ),
            }
          : current,
      );
      mutate(
        (pages) =>
          pages?.map((page) => ({
            ...page,
            threads: page.threads.filter(
              (thread) => !removed.has(getListThreadKey(thread)),
            ),
          })),
        { populateCache: true, revalidate: false },
      ).catch(() => {});
      removeCachedThreadsFromView({
        emailAccountId,
        viewKey,
        threadIds: removedKeys,
      }).catch(() => {});

      return { viewIdentity, entries };
    },
    [
      emailAccountId,
      mutate,
      pageIndexByThreadKey,
      sourceThreads,
      viewIdentity,
      viewKey,
    ],
  );

  const restoreThreads = useCallback(
    (removal: CombinedThreadRemoval, threadKeys: string[]) => {
      if (removal.viewIdentity !== viewIdentity) return;
      const restoring = threadKeys
        .map((threadKey) => removal.entries.get(threadKey))
        .filter((entry): entry is RemovedCombinedThread => entry !== undefined);
      if (!restoring.length) return;

      for (const entry of restoring) {
        removal.entries.delete(getListThreadKey(entry.thread));
      }
      const hidden = new Set(
        hiddenByView.current.get(viewIdentity) ?? EMPTY_THREAD_KEYS,
      );
      for (const entry of restoring) {
        hidden.delete(getListThreadKey(entry.thread));
      }
      hiddenByView.current.set(viewIdentity, hidden);
      renderHiddenChanges();
      const firstPageEntries = restoring.filter(
        (entry) => entry.pageIndex === 0,
      );
      setPersistent((current) =>
        current?.identity === viewIdentity
          ? {
              ...current,
              threads: insertRestoredCombinedThreads(
                current.threads,
                firstPageEntries,
              ),
            }
          : current,
      );
      mutate(
        (pages) =>
          pages?.map((page, pageIndex) => ({
            ...page,
            threads: insertRestoredCombinedThreads(
              page.threads,
              restoring.filter((entry) => entry.pageIndex === pageIndex),
            ),
          })),
        { populateCache: true, revalidate: false },
      ).catch(() => {});
      restoreCachedThreadsToView({
        emailAccountId,
        viewKey,
        entries: firstPageEntries.map(({ thread, index, threadOrder }) => ({
          thread: toCachedCombinedThread(thread),
          index,
          threadOrder,
        })),
      }).catch(() => {});
    },
    [emailAccountId, mutate, viewIdentity, viewKey],
  );

  const optimisticallyUpdateThreads = useCallback(
    (
      threadKeys: string[],
      updater: (thread: CombinedThread) => CombinedThread,
    ) => {
      const targets = new Set(threadKeys);
      const previousByKey = new Map<string, CombinedThread>();
      const updatedByKey = new Map<string, CombinedThread>();
      const updateToken = Symbol("combined-thread-update");

      for (const thread of sourceThreads ?? []) {
        const threadKey = getListThreadKey(thread);
        if (!targets.has(threadKey)) continue;
        const updated = updater(thread);
        if (updated === thread) continue;
        previousByKey.set(threadKey, thread);
        updatedByKey.set(threadKey, updated);
        optimisticUpdateTokens.current.set(threadKey, updateToken);
      }

      const applyUpdates = (
        replacements: ReadonlyMap<string, CombinedThread>,
      ) => {
        if (!replacements.size) return;
        setSynced((current) => {
          if (current?.identity !== viewIdentity) return current;
          const threads = replaceCombinedThreads(current.threads, replacements);
          return threads === current.threads
            ? current
            : { ...current, threads };
        });
        setPersistent((current) => {
          if (current?.identity !== viewIdentity) return current;
          const threads = replaceCombinedThreads(current.threads, replacements);
          return threads === current.threads
            ? current
            : { ...current, threads };
        });
        mutate(
          (pages) => {
            if (!pages) return pages;
            let changed = false;
            const updatedPages = pages.map((page) => {
              const threads = replaceCombinedThreads(
                page.threads,
                replacements,
              );
              if (threads === page.threads) return page;
              changed = true;
              return { ...page, threads };
            });
            return changed ? updatedPages : pages;
          },
          { populateCache: true, revalidate: false },
        ).catch(() => {});
      };

      applyUpdates(updatedByKey);
      const changedThreadKeys = [...updatedByKey.keys()];
      const isLatestUpdate = (threadKey: string) =>
        optimisticUpdateTokens.current.get(threadKey) === updateToken;

      return {
        threadKeys: changedThreadKeys,
        commit: (threadKey: string) => {
          if (isLatestUpdate(threadKey)) {
            optimisticUpdateTokens.current.delete(threadKey);
          }
        },
        rollback: (failedThreadKeys: string[]) => {
          const restoring = new Map<string, CombinedThread>();
          for (const threadKey of failedThreadKeys) {
            if (!isLatestUpdate(threadKey)) continue;
            optimisticUpdateTokens.current.delete(threadKey);
            const previous = previousByKey.get(threadKey);
            if (previous) restoring.set(threadKey, previous);
          }
          applyUpdates(restoring);
        },
      };
    },
    [mutate, sourceThreads, viewIdentity],
  );

  useEffect(() => {
    const loadedPageCount = data?.length ?? 0;
    if (error && size > loadedPageCount) {
      loadMoreLock.current = false;
      setSize(Math.max(loadedPageCount, 1)).catch(() => {});
      return;
    }
    if (!isLoadingMore) loadMoreLock.current = false;
  }, [data?.length, error, isLoadingMore, setSize, size]);

  return {
    threads,
    isLoading: isLoading && sourceThreads === undefined,
    error: sourceThreads !== undefined ? undefined : error,
    hasMore: Boolean(hasMore),
    isLoadingMore,
    failedAccountIds,
    labelsByAccount,
    removeThreads,
    restoreThreads,
    optimisticallyUpdateThreads,
    loadMore: useCallback(() => {
      if (loadMoreLock.current || !hasMore) return;
      loadMoreLock.current = true;
      setSize((current) => current + 1).catch(() => {
        loadMoreLock.current = false;
      });
    }, [hasMore, setSize]),
  };
}

function toCachedCombinedThread(thread: CombinedThread): CachedCombinedThread {
  return { id: getListThreadKey(thread), thread };
}

const EMPTY_THREAD_KEYS = new Set<string>();

function mergeCombinedThreads({
  accountStates,
  failedAccountIds,
  remoteLoadedAt,
  remoteThreads,
  syncedThreads,
}: {
  accountStates: SyncedCombinedMailboxSnapshot["accountStates"];
  failedAccountIds: string[];
  remoteLoadedAt: number;
  remoteThreads: CombinedThread[];
  syncedThreads: CombinedThread[];
}) {
  const locallyAuthoritativeAccountIds = new Set(
    Object.entries(accountStates)
      .filter(
        ([accountId, state]) =>
          failedAccountIds.includes(accountId) ||
          state.syncedAt > remoteLoadedAt,
      )
      .map(([accountId]) => accountId),
  );
  const oldestSyncedTimestampByAccount = new Map<string, number>();
  for (const thread of syncedThreads) {
    const timestamp = getThreadTimestamp(thread);
    const current = oldestSyncedTimestampByAccount.get(thread.account.id);
    if (current === undefined || timestamp < current) {
      oldestSyncedTimestampByAccount.set(thread.account.id, timestamp);
    }
  }
  const remoteThreadsByKey = new Map(
    remoteThreads.map((thread) => [getListThreadKey(thread), thread]),
  );
  const threadsByKey = new Map(
    remoteThreads
      .filter((thread) => {
        const state = accountStates[thread.account.id];
        if (!state || !locallyAuthoritativeAccountIds.has(thread.account.id)) {
          return true;
        }
        const afterTimestamp = new Date(state.after).getTime();
        const oldestSyncedTimestamp =
          oldestSyncedTimestampByAccount.get(thread.account.id) ??
          afterTimestamp;
        const authoritativeCutoff = state.truncated
          ? Math.max(afterTimestamp, oldestSyncedTimestamp)
          : afterTimestamp;
        const timestamp = getThreadTimestamp(thread);
        return state.truncated
          ? timestamp <= authoritativeCutoff
          : timestamp < authoritativeCutoff;
      })
      .map((thread) => [getListThreadKey(thread), thread]),
  );
  for (const thread of syncedThreads) {
    if (!locallyAuthoritativeAccountIds.has(thread.account.id)) continue;
    const remoteThread = remoteThreadsByKey.get(getListThreadKey(thread));
    threadsByKey.set(getListThreadKey(thread), {
      ...thread,
      plan: remoteThread?.plan ?? thread.plan,
      plans: remoteThread?.plans ?? thread.plans,
    });
  }
  return [...threadsByKey.values()].sort(
    (left, right) => getThreadTimestamp(right) - getThreadTimestamp(left),
  );
}

function insertRestoredCombinedThreads(
  threads: CombinedThread[],
  restoring: RemovedCombinedThread[],
) {
  if (!restoring.length) return threads;
  const threadsByKey = new Map(
    [...threads, ...restoring.map((entry) => entry.thread)].map((thread) => [
      getListThreadKey(thread),
      thread,
    ]),
  );
  return restoreThreadOrder(
    threads.map(getListThreadKey),
    restoring.map(({ thread, index, threadOrder }) => ({
      threadId: getListThreadKey(thread),
      index,
      threadOrder,
    })),
  )
    .map((threadKey) => threadsByKey.get(threadKey))
    .filter((thread): thread is CombinedThread => thread !== undefined);
}

function replaceCombinedThreads(
  threads: CombinedThread[],
  replacements: ReadonlyMap<string, CombinedThread>,
) {
  let changed = false;
  const updatedThreads = threads.map((thread) => {
    const replacement = replacements.get(getListThreadKey(thread));
    if (!replacement || replacement === thread) return thread;
    changed = true;
    return replacement;
  });
  return changed ? updatedThreads : threads;
}
