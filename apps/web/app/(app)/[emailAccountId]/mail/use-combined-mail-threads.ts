"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSWRConfig } from "swr";
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
  writeCachedThreadList,
} from "@/utils/email-cache/thread-lists";
import {
  EMAIL_CACHE_MEASURES,
  finishEmailCacheMeasure,
  startEmailCacheMeasure,
} from "@/utils/email-cache/telemetry";
import { getThreadTimestamp } from "@/utils/threads/sort";
import { createSearchParams } from "@/utils/url";
import { isThreadUnread } from "./read-state";
import {
  applyMailMutationOverlayToThreads,
  useRetainedMailMutationOverlay,
} from "@/hooks/useMailMutationOverlay";

type CombinedThread = GetAllThreadsResponse["threads"][number];

const COMBINED_PAGE_SIZE = 20;

type CachedCombinedThread = {
  id: string;
  thread: CombinedThread;
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
  labelName,
}: {
  accounts: CombinedThread["account"][];
  emailAccountId: string;
  enabled: boolean;
  isUnread: boolean;
  labelName?: string;
}) {
  const accountIdentity = useMemo(
    () =>
      accounts
        .map((account) => account.id)
        .sort()
        .join(":"),
    [accounts],
  );
  const mutationAccountIds = useMemo(
    () => accounts.map((account) => account.id),
    [accounts],
  );
  const viewKey = useMemo(
    () =>
      createThreadListCacheKey({
        scope: "combined",
        accountIdentity,
        isUnread: isUnread || undefined,
        labelName,
      }),
    [accountIdentity, isUnread, labelName],
  );
  const viewIdentity = `${emailAccountId}:${accountIdentity}:${viewKey}`;
  const { fetcher } = useSWRConfig();
  const remoteRequest = useRef({
    identity: viewIdentity,
    startedAt: Date.now(),
  });
  const getKey = useCallback(
    (pageIndex: number, previousPageData: GetAllThreadsResponse | null) => {
      if (!enabled || (previousPageData && !previousPageData.nextPageToken)) {
        return null;
      }
      const params = createSearchParams({
        accountSet: accountIdentity,
        limit: COMBINED_PAGE_SIZE,
        isUnread: isUnread || undefined,
        labelName,
        cursor: pageIndex > 0 ? previousPageData?.nextPageToken : undefined,
      });
      return `/api/threads/all?${params.toString()}`;
    },
    [accountIdentity, enabled, isUnread, labelName],
  );
  const fetchCombinedPage = useCallback(
    async (key: string) => {
      if (!fetcher) throw new Error("SWR fetcher is unavailable");
      const query = new URLSearchParams(key.split("?")[1]);
      if (!query.has("cursor")) {
        remoteRequest.current = {
          identity: viewIdentity,
          startedAt: Date.now(),
        };
      }
      return (await fetcher(key)) as GetAllThreadsResponse;
    },
    [fetcher, viewIdentity],
  );
  const { data, error, isLoading, size, setSize, mutate } =
    useSWRInfinite<GetAllThreadsResponse>(
      getKey,
      fetcher ? fetchCombinedPage : null,
      {
        keepPreviousData: false,
        revalidateFirstPage: false,
        revalidateOnFocus: false,
      },
    );
  const reconcileMailMutations = useCallback(() => mutate(), [mutate]);
  const { isReady: mutationOverlayReady, mutations: mailMutations } =
    useRetainedMailMutationOverlay({
      emailAccountIds: mutationAccountIds,
      enabled,
      onReconcile: reconcileMailMutations,
    });
  const [persistent, setPersistent] = useState<PersistentCombinedView>();
  const [synced, setSynced] = useState<SyncedCombinedView>();
  const [localPagination, setLocalPagination] = useState({
    identity: viewIdentity,
    limit: COMBINED_PAGE_SIZE,
  });
  const [isLoadingMoreLocally, setIsLoadingMoreLocally] = useState(false);
  const accountsRef = useRef(accounts);
  const optimisticUpdateTokens = useRef(new Map<string, symbol>());
  const remoteIdentity = useRef<string | undefined>(undefined);
  const remoteSnapshot = useRef<{
    firstPage?: GetAllThreadsResponse;
    loadedAt: number;
  }>({ loadedAt: 0 });
  const loadMoreLock = useRef(false);
  const localSnapshotLimit =
    localPagination.identity === viewIdentity
      ? localPagination.limit
      : COMBINED_PAGE_SIZE;

  if (remoteRequest.current.identity !== viewIdentity) {
    remoteRequest.current = {
      identity: viewIdentity,
      startedAt: Date.now(),
    };
  }
  remoteIdentity.current = data?.[0] ? viewIdentity : undefined;
  accountsRef.current = accounts;
  if (data?.[0] && remoteSnapshot.current.firstPage !== data[0]) {
    remoteSnapshot.current = {
      firstPage: data[0],
      loadedAt: remoteRequest.current.startedAt,
    };
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
    if (!enabled || !accountIdentity || labelName) return;
    let cancelled = false;
    const accountIds = new Set(
      accountsRef.current.map((account) => account.id),
    );
    let readGeneration = 0;
    const loadSyncedView = () => {
      const generation = ++readGeneration;
      readCombinedSyncedMailboxThreads({
        accounts: accountsRef.current,
        limit: localSnapshotLimit,
        query: { type: isUnread ? "unread" : "inbox" },
      }).then((snapshot) => {
        if (cancelled || generation !== readGeneration) return;
        setIsLoadingMoreLocally(false);
        if (!snapshot) return;
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
  }, [
    accountIdentity,
    enabled,
    isUnread,
    labelName,
    localSnapshotLimit,
    viewIdentity,
  ]);

  const remoteThreads = useMemo(
    () => data?.flatMap((page) => page.threads),
    [data],
  );
  const remoteHasMore = Boolean(data?.at(-1)?.nextPageToken);
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
      remoteThreads && syncedThreads
        ? mergeCombinedThreads({
            accountStates: syncedView.accountStates,
            failedAccountIds,
            remoteHasMore,
            remoteLoadedAt: remoteSnapshot.current.loadedAt,
            remoteThreads,
            syncedThreads,
          })
        : (remoteThreads ?? syncedThreads ?? persistentThreads),
    [
      persistentThreads,
      failedAccountIds,
      remoteHasMore,
      remoteThreads,
      syncedThreads,
      syncedView?.accountStates,
    ],
  );
  const baseThreads = useMemo(() => {
    const byKey = new Map<string, GetAllThreadsResponse["threads"][number]>();
    for (const thread of sourceThreads ?? []) {
      const threadKey = getListThreadKey(thread);
      byKey.set(threadKey, thread);
    }
    return [...byKey.values()].sort(
      (left, right) => getThreadTimestamp(right) - getThreadTimestamp(left),
    );
  }, [sourceThreads]);
  const threads = useMemo(() => {
    if (!mutationOverlayReady) return [];
    const overlaidThreads = applyMailMutationOverlayToThreads({
      getEmailAccountId: (thread) => thread.account.id,
      mutations: mailMutations,
      threads: baseThreads,
    });
    return isUnread
      ? overlaidThreads.filter((thread) => isThreadUnread(thread.messages))
      : overlaidThreads;
  }, [baseThreads, isUnread, mailMutations, mutationOverlayReady]);
  const hasMore = Boolean(
    remoteHasMore ||
      syncedView?.truncated ||
      (!data &&
        !syncedView &&
        persistent?.identity === viewIdentity &&
        persistent.hasMore),
  );
  const canLoadMoreLocally = Boolean(syncedView?.truncated);
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
  useEffect(() => {
    if (!enabled || (!data?.[0] && !syncedView)) {
      return;
    }
    writeCachedThreadList({
      emailAccountId,
      viewKey,
      threads: baseThreads.map(toCachedCombinedThread),
      hasMore,
    }).catch(() => {});
  }, [
    data,
    emailAccountId,
    enabled,
    hasMore,
    baseThreads,
    syncedView,
    viewKey,
  ]);

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
    isLoading:
      enabled &&
      (!mutationOverlayReady || (isLoading && !sourceThreads?.length)),
    error: mutationOverlayReady && !sourceThreads?.length ? error : undefined,
    hasMore: Boolean(hasMore),
    isLoadingMore: isLoadingMore || isLoadingMoreLocally,
    failedAccountIds,
    labelsByAccount,
    refetch: mutate,
    optimisticallyUpdateThreads,
    loadMore: useCallback(() => {
      if (loadMoreLock.current || !hasMore) return;
      if (canLoadMoreLocally) {
        if (isLoadingMoreLocally) return;
        setIsLoadingMoreLocally(true);
        setLocalPagination((current) => ({
          identity: viewIdentity,
          limit:
            (current.identity === viewIdentity
              ? current.limit
              : COMBINED_PAGE_SIZE) + COMBINED_PAGE_SIZE,
        }));
        return;
      }
      loadMoreLock.current = true;
      setSize((current) => current + 1).catch(() => {
        loadMoreLock.current = false;
      });
    }, [
      canLoadMoreLocally,
      hasMore,
      isLoadingMoreLocally,
      setSize,
      viewIdentity,
    ]),
  };
}

function toCachedCombinedThread(thread: CombinedThread): CachedCombinedThread {
  return { id: getListThreadKey(thread), thread };
}

function mergeCombinedThreads({
  accountStates,
  failedAccountIds,
  remoteHasMore,
  remoteLoadedAt,
  remoteThreads,
  syncedThreads,
}: {
  accountStates: SyncedCombinedMailboxSnapshot["accountStates"];
  failedAccountIds: string[];
  remoteHasMore: boolean;
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
  const oldestRemoteTimestamp = remoteThreads.reduce(
    (oldest, thread) => Math.min(oldest, getThreadTimestamp(thread)),
    Number.POSITIVE_INFINITY,
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
    const locallyAuthoritative = locallyAuthoritativeAccountIds.has(
      thread.account.id,
    );
    if (!locallyAuthoritative && !remoteHasMore) continue;
    const remoteThread = remoteThreadsByKey.get(getListThreadKey(thread));
    if (!locallyAuthoritative && remoteThread) continue;
    if (
      !locallyAuthoritative &&
      getThreadTimestamp(thread) > oldestRemoteTimestamp
    ) {
      continue;
    }
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
