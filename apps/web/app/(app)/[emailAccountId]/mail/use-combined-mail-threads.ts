"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import useSWRInfinite from "swr/infinite";
import type { GetAllThreadsResponse } from "@/app/api/threads/all/route";
import { getListThreadKey } from "@/app/(app)/[emailAccountId]/mail/types";
import type { EmailLabels } from "@/providers/email-label-types";
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
  cachedAt: number;
  hasMore: boolean;
  threads: CombinedThread[];
};

export function useCombinedMailThreads({
  emailAccountId,
  enabled,
  isUnread,
}: {
  emailAccountId: string;
  enabled: boolean;
  isUnread: boolean;
}) {
  const viewKey = useMemo(
    () =>
      createThreadListCacheKey({
        scope: "combined",
        isUnread: isUnread || undefined,
      }),
    [isUnread],
  );
  const viewIdentity = `${emailAccountId}:${viewKey}`;
  const getKey = useCallback(
    (pageIndex: number, previousPageData: GetAllThreadsResponse | null) => {
      if (!enabled || (previousPageData && !previousPageData.nextPageToken)) {
        return null;
      }
      const params = createSearchParams({
        limit: 20,
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
  const remoteIdentity = useRef<string | undefined>(undefined);
  const loadMoreLock = useRef(false);

  remoteIdentity.current = data?.[0] ? viewIdentity : undefined;

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
        cachedAt: cached.cachedAt,
        hasMore: cached.hasMore,
        threads: cached.threads.map((entry) => entry.thread),
      });
    });

    return () => {
      cancelled = true;
    };
  }, [emailAccountId, enabled, viewIdentity, viewKey]);

  const remoteThreads = useMemo(
    () => data?.flatMap((page) => page.threads),
    [data],
  );
  const persistentThreads =
    persistent?.identity === viewIdentity ? persistent.threads : undefined;
  const sourceThreads = remoteThreads ?? persistentThreads;
  const threads = useMemo(() => {
    const byKey = new Map<string, GetAllThreadsResponse["threads"][number]>();
    for (const thread of sourceThreads ?? []) {
      byKey.set(getListThreadKey(thread), thread);
    }
    return [...byKey.values()].sort(
      (left, right) => getThreadTimestamp(right) - getThreadTimestamp(left),
    );
  }, [sourceThreads]);
  const hasMore = data
    ? Boolean(data.at(-1)?.nextPageToken)
    : persistent?.identity === viewIdentity && persistent.hasMore;
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
    if (!enabled) return;
    const firstPage = data?.[0];
    if (!firstPage) return;
    writeCachedThreadList({
      emailAccountId,
      viewKey,
      threads: firstPage.threads.map(toCachedCombinedThread),
      hasMore: Boolean(firstPage.nextPageToken),
    }).catch(() => {});
  }, [data, emailAccountId, enabled, viewKey]);

  const removeThreads = useCallback(
    (threadKeys: string[]): CombinedThreadRemoval => {
      const entries = new Map<string, RemovedCombinedThread>();
      if (!threadKeys.length) return { viewIdentity, entries };
      const targets = new Set(threadKeys);

      if (data) {
        for (const [pageIndex, page] of data.entries()) {
          const threadOrder = page.threads.map(getListThreadKey);
          for (const [index, thread] of page.threads.entries()) {
            const threadKey = getListThreadKey(thread);
            if (targets.has(threadKey)) {
              entries.set(threadKey, {
                thread,
                pageIndex,
                index,
                threadOrder,
              });
            }
          }
        }
      } else {
        const threadOrder = (persistentThreads ?? []).map(getListThreadKey);
        for (const [index, thread] of (persistentThreads ?? []).entries()) {
          const threadKey = getListThreadKey(thread);
          if (targets.has(threadKey)) {
            entries.set(threadKey, {
              thread,
              pageIndex: 0,
              index,
              threadOrder,
            });
          }
        }
      }

      const removedKeys = [...entries.keys()];
      if (!removedKeys.length) return { viewIdentity, entries };
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
    [data, emailAccountId, mutate, persistentThreads, viewIdentity, viewKey],
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
      setPersistent((current) =>
        current?.identity === viewIdentity
          ? {
              ...current,
              threads: insertRestoredThreads(current.threads, restoring),
            }
          : current,
      );
      mutate(
        (pages) =>
          pages?.map((page, pageIndex) => {
            const pageEntries = restoring.filter(
              (entry) => entry.pageIndex === pageIndex,
            );
            return {
              ...page,
              threads: insertRestoredThreads(page.threads, pageEntries),
            };
          }),
        { populateCache: true, revalidate: false },
      ).catch(() => {});
      restoreCachedThreadsToView({
        emailAccountId,
        viewKey,
        entries: restoring
          .filter((entry) => entry.pageIndex === 0)
          .map(({ thread, index, threadOrder }) => ({
            thread: toCachedCombinedThread(thread),
            index,
            threadOrder,
          })),
      }).catch(() => {});
    },
    [emailAccountId, mutate, viewIdentity, viewKey],
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
    isLoading: isLoading && !sourceThreads,
    error: sourceThreads ? undefined : error,
    hasMore: Boolean(hasMore),
    isLoadingMore,
    failedAccountIds: [
      ...new Set(data?.flatMap((page) => page.failedAccountIds) ?? []),
    ],
    labelsByAccount,
    removeThreads,
    restoreThreads,
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

function insertRestoredThreads(
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
