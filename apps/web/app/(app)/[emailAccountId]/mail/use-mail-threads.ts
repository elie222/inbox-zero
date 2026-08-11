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
import type { ThreadsListResponse } from "@/app/api/threads/route";
import type { ListThread } from "@/app/(app)/[emailAccountId]/mail/types";
import type { ThreadsQuery } from "@/utils/threads/validation";
import { createSearchParams } from "@/utils/url";
import { createThreadListCacheKey } from "@/utils/email-cache/keys";
import {
  readCachedThreadList,
  removeCachedThreadsFromView,
  restoreCachedThreadsToView,
  writeCachedThreadList,
} from "@/utils/email-cache/thread-lists";
import {
  EMAIL_CACHE_MEASURES,
  finishEmailCacheMeasure,
  startEmailCacheMeasure,
} from "@/utils/email-cache/telemetry";

type RemovedThread = {
  thread: ListThread;
  pageIndex: number;
  index: number;
  viewIdentity: string;
};

type PersistentView = {
  identity: string;
  cachedAt: number;
  hasMore: boolean;
  threads: ListThread[];
};

const MAX_RETAINED_REMOVALS = 200;

export function useMailThreads({
  emailAccountId,
  query,
}: {
  emailAccountId: string;
  query: ThreadsQuery;
}) {
  const viewKey = useMemo(() => createThreadListCacheKey(query), [query]);
  const viewIdentity = `${emailAccountId}:${viewKey}`;
  const getKey = useCallback(
    (pageIndex: number, previousPageData: ThreadsListResponse | null) => {
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
    [emailAccountId, query],
  );

  const { data, size, setSize, isLoading, error, mutate } =
    useSWRInfinite<ThreadsListResponse>(getKey, {
      keepPreviousData: false,
      revalidateOnFocus: false,
      revalidateFirstPage: false,
    });
  const [persistent, setPersistent] = useState<PersistentView>();
  const hiddenByView = useRef(new Map<string, Set<string>>());
  const [, renderHiddenChanges] = useReducer((version) => version + 1, 0);
  const remoteIdentity = useRef<string>();
  const removed = useRef(new Map<string, RemovedThread>());

  if (data?.[0]) remoteIdentity.current = viewIdentity;

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

  const hiddenThreadIds =
    hiddenByView.current.get(viewIdentity) ?? EMPTY_THREAD_IDS;
  const remoteThreads = useMemo(
    () => data?.flatMap((page) => page.threads),
    [data],
  );
  const persistentThreads =
    persistent?.identity === viewIdentity ? persistent.threads : undefined;
  const sourceThreads = remoteThreads ?? persistentThreads;
  const threads = useMemo(
    () =>
      sourceThreads?.filter((thread) => !hiddenThreadIds.has(thread.id)) ?? [],
    [hiddenThreadIds, sourceThreads],
  );

  useEffect(() => {
    const firstPage = data?.[0];
    if (!firstPage) return;
    writeCachedThreadList({
      emailAccountId,
      viewKey,
      threads: firstPage.threads.filter(
        (thread) => !hiddenThreadIds.has(thread.id),
      ),
      hasMore: Boolean(firstPage.nextPageToken),
    }).catch(() => {});
  }, [data, emailAccountId, hiddenThreadIds, viewKey]);

  const removeThreads = useCallback(
    (threadIds: string[]) => {
      if (!threadIds.length) return;
      const targets = new Set(threadIds);

      if (data) {
        for (const [pageIndex, page] of data.entries()) {
          for (const [index, thread] of page.threads.entries()) {
            if (targets.has(thread.id)) {
              removed.current.set(thread.id, {
                thread,
                pageIndex,
                index,
                viewIdentity,
              });
            }
          }
        }
      } else {
        for (const [index, thread] of (persistentThreads ?? []).entries()) {
          if (targets.has(thread.id)) {
            removed.current.set(thread.id, {
              thread,
              pageIndex: 0,
              index,
              viewIdentity,
            });
          }
        }
      }

      hiddenByView.current.set(
        viewIdentity,
        new Set([
          ...(hiddenByView.current.get(viewIdentity) ?? []),
          ...threadIds,
        ]),
      );
      renderHiddenChanges();
      setPersistent((current) =>
        current?.identity === viewIdentity
          ? {
              ...current,
              threads: current.threads.filter(
                (thread) => !targets.has(thread.id),
              ),
            }
          : current,
      );
      mutate(
        (pages) =>
          pages?.map((page) => ({
            ...page,
            threads: page.threads.filter((thread) => !targets.has(thread.id)),
          })),
        { revalidate: false, populateCache: true },
      ).catch(() => {});
      removeCachedThreadsFromView({
        emailAccountId,
        viewKey,
        threadIds,
      }).catch(() => {});

      while (removed.current.size > MAX_RETAINED_REMOVALS) {
        const oldest = removed.current.keys().next().value;
        if (oldest === undefined) break;
        removed.current.delete(oldest);
      }
    },
    [data, emailAccountId, mutate, persistentThreads, viewIdentity, viewKey],
  );

  const restoreThreads = useCallback(
    (threadIds: string[]) => {
      const restoring = threadIds
        .map((id) => removed.current.get(id))
        .filter(
          (entry): entry is RemovedThread =>
            entry !== undefined && entry.viewIdentity === viewIdentity,
        );
      if (!restoring.length) return;

      for (const entry of restoring) removed.current.delete(entry.thread.id);
      const restoringIds = new Set(restoring.map((entry) => entry.thread.id));
      hiddenByView.current.set(
        viewIdentity,
        new Set(
          [...(hiddenByView.current.get(viewIdentity) ?? [])].filter(
            (id) => !restoringIds.has(id),
          ),
        ),
      );
      renderHiddenChanges();
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
          pages?.map((page, pageIndex) => ({
            ...page,
            threads: insertRestoredThreads(
              page.threads,
              restoring.filter((entry) => entry.pageIndex === pageIndex),
            ),
          })),
        { revalidate: false, populateCache: true },
      ).catch(() => {});
      restoreCachedThreadsToView({
        emailAccountId,
        viewKey,
        entries: restoring
          .filter((entry) => entry.pageIndex === 0)
          .map(({ thread, index }) => ({ thread, index })),
      }).catch(() => {});
    },
    [emailAccountId, mutate, viewIdentity, viewKey],
  );

  const hasMore = data
    ? Boolean(data.at(-1)?.nextPageToken)
    : persistent?.identity === viewIdentity && persistent.hasMore;

  return {
    threads,
    isLoading: isLoading && !sourceThreads,
    error: sourceThreads ? undefined : error,
    hasMore: Boolean(hasMore),
    isLoadingMore: size > 1 && !data?.[size - 1],
    loadMore: useCallback(() => {
      if (data) setSize((current) => current + 1).catch(() => {});
      else mutate().catch(() => {});
    }, [data, mutate, setSize]),
    removeThreads,
    restoreThreads,
  };
}

const EMPTY_THREAD_IDS = new Set<string>();

function insertRestoredThreads(
  threads: ListThread[],
  restoring: Array<Pick<RemovedThread, "thread" | "index">>,
) {
  if (!restoring.length) return threads;
  const restoringIds = new Set(restoring.map((entry) => entry.thread.id));
  const result = threads.filter((thread) => !restoringIds.has(thread.id));
  for (const entry of [...restoring].sort(
    (first, second) => first.index - second.index,
  )) {
    result.splice(Math.min(entry.index, result.length), 0, entry.thread);
  }
  return result;
}
