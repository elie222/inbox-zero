"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWRInfinite from "swr/infinite";
import type { ListThread } from "@/app/(app)/[emailAccountId]/mail/types";
import type { ThreadsListResponse } from "@/app/api/threads/route";
import { trackMailboxListReady } from "@/utils/email-cache/analytics";
import { createThreadListCacheKey } from "@/utils/email-cache/keys";
import {
  readCachedThreadList,
  writeCachedThreadList,
  writeCachedThreadRows,
} from "@/utils/email-cache/thread-lists";
import { getThreadTimestamp } from "@/utils/threads/sort";
import {
  EMAIL_CACHE_MEASURES,
  finishEmailCacheMeasure,
  startEmailCacheMeasure,
} from "@/utils/email-cache/telemetry";
import {
  readSyncedMailboxThreads,
  subscribeToMailboxStore,
} from "@/utils/email-cache/mailbox";
import type { ThreadsQuery } from "@/utils/threads/validation";
import { createSearchParams } from "@/utils/url";
import { isThreadUnread } from "./read-state";
import {
  applyMailMutationOverlayToThreads,
  useRetainedMailMutationOverlay,
} from "@/hooks/useMailMutationOverlay";

export type OptimisticThreadUpdate = {
  threadIds: string[];
  commit: (threadId: string) => void;
  rollback: (threadIds: string[]) => void;
};

type PersistentView = {
  identity: string;
  cachedAt: number;
  hasMore: boolean;
  threads: ListThread[];
};

type SyncedView = {
  identity: string;
  after: string;
  complete: boolean;
  syncedAt: number;
  threads: ListThread[];
  truncated: boolean;
};

export function useMailThreads({
  emailAccountId,
  query,
  enabled = true,
}: {
  emailAccountId: string;
  query: ThreadsQuery;
  enabled?: boolean;
}) {
  const viewKey = useMemo(() => createThreadListCacheKey(query), [query]);
  const viewIdentity = `${emailAccountId}:${viewKey}`;
  const getKey = useCallback(
    (pageIndex: number, previousPageData: ThreadsListResponse | null) => {
      if (!enabled) return null;
      if (previousPageData && !previousPageData.nextPageToken) return null;

      const params = createSearchParams({
        ...query,
        view: "list",
        ...(pageIndex > 0 && previousPageData?.nextPageToken
          ? { nextPageToken: previousPageData.nextPageToken }
          : {}),
      });

      return [`/api/threads?${params.toString()}`, emailAccountId] as [
        string,
        string,
      ];
    },
    [emailAccountId, enabled, query],
  );

  const { data, size, setSize, isLoading, error, mutate } =
    useSWRInfinite<ThreadsListResponse>(getKey, {
      keepPreviousData: false,
      revalidateOnFocus: false,
      revalidateFirstPage: false,
    });
  const reconcileMailMutations = useCallback(() => mutate(), [mutate]);
  const { isReady: mutationOverlayReady, mutations: mailMutations } =
    useRetainedMailMutationOverlay({
      emailAccountId,
      enabled,
      onReconcile: reconcileMailMutations,
    });
  const [persistent, setPersistent] = useState<PersistentView>();
  const [synced, setSynced] = useState<SyncedView>();
  const [paginationRequestIdentity, setPaginationRequestIdentity] =
    useState<string>();
  const paginationRetryIdentity = useRef<string | undefined>(undefined);
  const optimisticUpdateTokens = useRef(new Map<string, symbol>());
  const revalidationRequested = useRef(false);
  const revalidationInProgress = useRef(false);
  const pendingReconciliationWrites = useRef(0);
  const remoteIdentity = useRef<string | undefined>(undefined);
  const remoteSnapshot = useRef<{
    firstPage?: ThreadsListResponse;
    loadedAt: number;
  }>({ loadedAt: 0 });
  const queryRef = useRef(query);
  // Auto-load can fire from the cursor and the bottom sentinel in the same
  // tick; two setSize(+1) calls would skip a page token.
  const loadMoreLock = useRef(false);
  const listReadyMeasurement = useRef({
    identity: viewIdentity,
    reported: false,
    startedAt: performance.now(),
  });

  if (listReadyMeasurement.current.identity !== viewIdentity) {
    listReadyMeasurement.current = {
      identity: viewIdentity,
      reported: false,
      startedAt: performance.now(),
    };
  }

  remoteIdentity.current = data?.[0] ? viewIdentity : undefined;
  queryRef.current = query;
  if (data?.[0] && remoteSnapshot.current.firstPage !== data[0]) {
    remoteSnapshot.current = { firstPage: data[0], loadedAt: Date.now() };
  }

  useEffect(() => {
    let cancelled = false;
    const startedAt = startEmailCacheMeasure();

    readCachedThreadList<ListThread>({ emailAccountId, viewKey }).then(
      (cached) => {
        finishEmailCacheMeasure(EMAIL_CACHE_MEASURES.listHydration, startedAt);
        if (cancelled || !cached || remoteIdentity.current === viewIdentity) {
          return;
        }
        setPersistent({ identity: viewIdentity, ...cached });
      },
    );

    return () => {
      cancelled = true;
    };
  }, [emailAccountId, viewIdentity, viewKey]);

  useEffect(() => {
    let cancelled = false;
    const loadSyncedView = () => {
      readSyncedMailboxThreads({
        emailAccountId,
        query: queryRef.current,
      }).then((snapshot) => {
        if (cancelled || !snapshot) return;
        setSynced({
          identity: viewIdentity,
          after: snapshot.after,
          complete: snapshot.complete,
          syncedAt: snapshot.syncedAt,
          threads: snapshot.threads,
          truncated: snapshot.truncated,
        });
      });
    };
    const unsubscribe = subscribeToMailboxStore((changedAccountId) => {
      if (changedAccountId === emailAccountId) loadSyncedView();
    });
    loadSyncedView();

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [emailAccountId, viewIdentity]);

  const remoteThreads = useMemo(
    () => data?.flatMap((page) => page.threads),
    [data],
  );
  const persistentThreads =
    persistent?.identity === viewIdentity ? persistent.threads : undefined;
  const syncedThreads =
    synced?.identity === viewIdentity &&
    (synced.complete || synced.threads.length > 0)
      ? synced.threads
      : undefined;
  const sourceThreads = useMemo(
    () =>
      remoteThreads &&
      syncedThreads &&
      synced?.complete &&
      synced.syncedAt > remoteSnapshot.current.loadedAt
        ? mergeSyncedThreads({
            remoteThreads,
            syncedThreads,
            syncedAfter: synced.after,
            syncedTruncated: synced.truncated,
          })
        : (remoteThreads ?? syncedThreads ?? persistentThreads),
    [
      persistentThreads,
      remoteThreads,
      synced?.after,
      synced?.complete,
      synced?.syncedAt,
      synced?.truncated,
      syncedThreads,
    ],
  );
  let readySource: "mailbox" | "persistent" | "remote" | undefined;
  if (mutationOverlayReady) {
    if (remoteThreads) readySource = "remote";
    else if (syncedThreads) readySource = "mailbox";
    else if (persistentThreads) readySource = "persistent";
  }
  const threads = useMemo(() => {
    if (!mutationOverlayReady) return [];
    const overlaidThreads = applyMailMutationOverlayToThreads({
      getEmailAccountId: () => emailAccountId,
      mutations: mailMutations,
      threads: sourceThreads ?? [],
    });
    return query.isUnread
      ? overlaidThreads.filter((thread) => isThreadUnread(thread.messages))
      : overlaidThreads;
  }, [
    emailAccountId,
    mailMutations,
    mutationOverlayReady,
    query.isUnread,
    sourceThreads,
  ]);

  useEffect(() => {
    if (!readySource || listReadyMeasurement.current.reported) return;
    listReadyMeasurement.current.reported = true;
    trackMailboxListReady({
      durationMs: performance.now() - listReadyMeasurement.current.startedAt,
      source: readySource,
      threadCount: threads.length,
    });
  }, [readySource, threads.length]);

  useEffect(() => {
    const firstPage = data?.[0];
    if (!firstPage) return;
    writeCachedThreadList({
      emailAccountId,
      viewKey,
      threads: firstPage.threads,
      hasMore: Boolean(firstPage.nextPageToken),
    }).catch(() => {});
  }, [data, emailAccountId, viewKey]);

  useEffect(() => {
    if (!paginationRequestIdentity) return;
    if (paginationRequestIdentity !== viewIdentity) {
      paginationRetryIdentity.current = undefined;
      setPaginationRequestIdentity(undefined);
      return;
    }
    if (error) {
      if (paginationRetryIdentity.current === viewIdentity) {
        paginationRetryIdentity.current = undefined;
        setPaginationRequestIdentity(undefined);
        return;
      }
      paginationRetryIdentity.current = viewIdentity;
      mutate()
        .then((pages) => {
          if (!pages) {
            paginationRetryIdentity.current = undefined;
            setPaginationRequestIdentity((current) =>
              current === viewIdentity ? undefined : current,
            );
          }
        })
        .catch(() => {
          paginationRetryIdentity.current = undefined;
          setPaginationRequestIdentity((current) =>
            current === viewIdentity ? undefined : current,
          );
        });
      return;
    }
    if (!data) return;

    paginationRetryIdentity.current = undefined;
    setPaginationRequestIdentity(undefined);
    if (data.at(-1)?.nextPageToken) {
      setSize((current) => current + 1).catch(() => {});
    }
  }, [data, error, mutate, paginationRequestIdentity, setSize, viewIdentity]);

  const reconcileOptimisticUpdates = useCallback(
    function reconcileOptimisticUpdates() {
      if (
        !revalidationRequested.current ||
        revalidationInProgress.current ||
        pendingReconciliationWrites.current ||
        optimisticUpdateTokens.current.size
      ) {
        return;
      }

      revalidationRequested.current = false;
      revalidationInProgress.current = true;
      mutate()
        .catch(() => {})
        .finally(() => {
          revalidationInProgress.current = false;
          reconcileOptimisticUpdates();
        });
    },
    [mutate],
  );

  const optimisticallyUpdateThreads = useCallback(
    (
      threadIds: string[],
      updater: (thread: ListThread) => ListThread,
    ): OptimisticThreadUpdate => {
      const targets = new Set(threadIds);
      const previousById = new Map<string, ListThread>();
      const updatedById = new Map<string, ListThread>();

      for (const thread of sourceThreads ?? []) {
        if (!targets.has(thread.id)) continue;
        const updated = updater(thread);
        if (updated === thread) continue;
        previousById.set(thread.id, thread);
        updatedById.set(thread.id, updated);
      }

      const changedThreadIds = [...updatedById.keys()];
      const updateToken = Symbol("optimistic-thread-update");
      if (changedThreadIds.length && revalidationInProgress.current) {
        revalidationRequested.current = true;
      }
      for (const threadId of changedThreadIds) {
        optimisticUpdateTokens.current.set(threadId, updateToken);
      }

      const applyThreadUpdates = (updates: ReadonlyMap<string, ListThread>) => {
        if (!updates.size) return Promise.resolve();
        setPersistent((current) =>
          current?.identity === viewIdentity
            ? {
                ...current,
                threads: replaceThreads(current.threads, updates),
              }
            : current,
        );
        setSynced((current) =>
          current?.identity === viewIdentity
            ? {
                ...current,
                threads: replaceThreads(current.threads, updates),
              }
            : current,
        );
        const localUpdate = mutate(
          (pages) =>
            pages?.map((page) => ({
              ...page,
              threads: replaceThreads(page.threads, updates),
            })),
          { revalidate: false, populateCache: true },
        );
        const persistentUpdate = writeCachedThreadRows({
          emailAccountId,
          threads: [...updates.values()],
        });

        return Promise.allSettled([localUpdate, persistentUpdate]).then(
          () => {},
        );
      };

      applyThreadUpdates(updatedById);

      const isLatestUpdate = (threadId: string) =>
        optimisticUpdateTokens.current.get(threadId) === updateToken;

      return {
        threadIds: changedThreadIds,
        commit: (threadId) => {
          if (isLatestUpdate(threadId)) {
            optimisticUpdateTokens.current.delete(threadId);
            reconcileOptimisticUpdates();
          }
        },
        rollback: (threadIds) => {
          const previousThreads = new Map<string, ListThread>();

          for (const threadId of threadIds) {
            if (!isLatestUpdate(threadId)) continue;
            optimisticUpdateTokens.current.delete(threadId);
            const previous = previousById.get(threadId);
            if (previous) previousThreads.set(threadId, previous);
          }

          if (previousThreads.size) {
            revalidationRequested.current = true;
            pendingReconciliationWrites.current += 1;
            applyThreadUpdates(previousThreads).finally(() => {
              pendingReconciliationWrites.current -= 1;
              reconcileOptimisticUpdates();
            });
          }
          reconcileOptimisticUpdates();
        },
      };
    },
    [
      emailAccountId,
      mutate,
      reconcileOptimisticUpdates,
      sourceThreads,
      viewIdentity,
    ],
  );

  const hasMore = data
    ? Boolean(data.at(-1)?.nextPageToken)
    : persistent?.identity === viewIdentity
      ? persistent.hasMore
      : Boolean(syncedThreads?.length);

  useEffect(() => {
    const loadedPageCount = data?.length ?? 0;
    if (error && size > 1 && size > loadedPageCount) {
      loadMoreLock.current = false;
      setSize(Math.max(loadedPageCount, 1)).catch(() => {});
      return;
    }

    const latestPageLoaded = !data || data.length === size;
    const paginationIdle = paginationRequestIdentity !== viewIdentity;
    if (latestPageLoaded && paginationIdle) loadMoreLock.current = false;
  }, [data, error, paginationRequestIdentity, setSize, size, viewIdentity]);

  return {
    threads,
    isLoading:
      enabled &&
      (!mutationOverlayReady || (isLoading && !sourceThreads?.length)),
    error: mutationOverlayReady && !sourceThreads?.length ? error : undefined,
    hasMore: Boolean(hasMore),
    isLoadingMore:
      paginationRequestIdentity === viewIdentity ||
      (size > 1 && !data?.[size - 1]),
    loadMore: useCallback(() => {
      if (loadMoreLock.current) return;

      if (data) {
        if (!data.at(-1)?.nextPageToken) return;
        loadMoreLock.current = true;
        const loadedPageCount = data.length;
        setSize(loadedPageCount + 1).catch(() => {
          loadMoreLock.current = false;
          setSize(loadedPageCount).catch(() => {});
        });
      } else {
        loadMoreLock.current = true;
        paginationRetryIdentity.current = undefined;
        setPaginationRequestIdentity(viewIdentity);
      }
    }, [data, setSize, viewIdentity]),
    optimisticallyUpdateThreads,
  };
}

function mergeSyncedThreads({
  remoteThreads,
  syncedThreads,
  syncedAfter,
  syncedTruncated,
}: {
  remoteThreads: ListThread[];
  syncedThreads: ListThread[];
  syncedAfter: string;
  syncedTruncated: boolean;
}) {
  const syncedAfterTimestamp = new Date(syncedAfter).getTime();
  const oldestSyncedTimestamp = Math.min(
    ...syncedThreads.map(getThreadTimestamp),
  );
  const authoritativeCutoff = syncedTruncated
    ? Math.max(syncedAfterTimestamp, oldestSyncedTimestamp)
    : syncedAfterTimestamp;
  const remoteThreadsById = new Map(
    remoteThreads.map((thread) => [thread.id, thread]),
  );
  const threadsById = new Map(
    remoteThreads
      .filter((thread) => {
        const timestamp = getThreadTimestamp(thread);
        return syncedTruncated
          ? timestamp <= authoritativeCutoff
          : timestamp < authoritativeCutoff;
      })
      .map((thread) => [thread.id, thread]),
  );
  for (const thread of syncedThreads) {
    const remoteThread = remoteThreadsById.get(thread.id);
    threadsById.set(thread.id, {
      ...thread,
      plan: remoteThread?.plan ?? thread.plan,
      plans: remoteThread?.plans ?? thread.plans,
    });
  }
  return [...threadsById.values()].sort(
    (left, right) => getThreadTimestamp(right) - getThreadTimestamp(left),
  );
}

function replaceThreads(
  threads: ListThread[],
  replacements: ReadonlyMap<string, ListThread>,
) {
  return threads.map((thread) => replacements.get(thread.id) ?? thread);
}
