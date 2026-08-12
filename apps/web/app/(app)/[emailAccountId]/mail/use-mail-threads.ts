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
import type { ListThread } from "@/app/(app)/[emailAccountId]/mail/types";
import type { ThreadsListResponse } from "@/app/api/threads/route";
import { createThreadListCacheKey } from "@/utils/email-cache/keys";
import {
  readCachedThreadList,
  removeCachedThreadsFromView,
  restoreCachedThreadsToView,
  writeCachedThreadList,
  writeCachedThreadRows,
} from "@/utils/email-cache/thread-lists";
import { restoreThreadOrder } from "@/utils/email-cache/thread-order";
import {
  EMAIL_CACHE_MEASURES,
  finishEmailCacheMeasure,
  startEmailCacheMeasure,
} from "@/utils/email-cache/telemetry";
import type { ThreadsQuery } from "@/utils/threads/validation";
import { createSearchParams } from "@/utils/url";

type RemovedThread = {
  thread: ListThread;
  pageIndex: number;
  index: number;
  threadOrder: readonly string[];
};

export type ThreadRemoval = {
  viewIdentity: string;
  entries: Map<string, RemovedThread>;
};

export type OptimisticThreadUpdate = {
  threadIds: string[];
  commit: (threadId: string) => void;
  rollback: (threadId: string) => void;
};

type PersistentView = {
  identity: string;
  cachedAt: number;
  hasMore: boolean;
  threads: ListThread[];
};

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
  const [paginationRequestIdentity, setPaginationRequestIdentity] =
    useState<string>();
  const paginationRetryIdentity = useRef<string | undefined>(undefined);
  const hiddenByView = useRef(new Map<string, Set<string>>());
  const optimisticUpdateTokens = useRef(new Map<string, symbol>());
  const [, renderHiddenChanges] = useReducer((version) => version + 1, 0);
  const remoteIdentity = useRef<string | undefined>(undefined);

  remoteIdentity.current = data?.[0] ? viewIdentity : undefined;

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

  const removeThreads = useCallback(
    (threadIds: string[]): ThreadRemoval => {
      const entries = new Map<string, RemovedThread>();
      if (!threadIds.length) return { viewIdentity, entries };

      const targets = new Set(threadIds);
      const alreadyHidden =
        hiddenByView.current.get(viewIdentity) ?? EMPTY_THREAD_IDS;

      if (data) {
        for (const [pageIndex, page] of data.entries()) {
          const threadOrder = page.threads.map((thread) => thread.id);
          for (const [index, thread] of page.threads.entries()) {
            if (targets.has(thread.id) && !alreadyHidden.has(thread.id)) {
              entries.set(thread.id, {
                thread,
                pageIndex,
                index,
                threadOrder,
              });
            }
          }
        }
      } else {
        const threadOrder = persistentThreads?.map((thread) => thread.id) ?? [];
        for (const [index, thread] of (persistentThreads ?? []).entries()) {
          if (targets.has(thread.id) && !alreadyHidden.has(thread.id)) {
            entries.set(thread.id, {
              thread,
              pageIndex: 0,
              index,
              threadOrder,
            });
          }
        }
      }

      const removedThreadIds = [...entries.keys()];
      if (!removedThreadIds.length) return { viewIdentity, entries };
      const removedIds = new Set(removedThreadIds);

      hiddenByView.current.set(
        viewIdentity,
        new Set([...alreadyHidden, ...removedThreadIds]),
      );
      renderHiddenChanges();
      setPersistent((current) =>
        current?.identity === viewIdentity
          ? {
              ...current,
              threads: current.threads.filter(
                (thread) => !removedIds.has(thread.id),
              ),
            }
          : current,
      );
      mutate(
        (pages) =>
          pages?.map((page) => ({
            ...page,
            threads: page.threads.filter(
              (thread) => !removedIds.has(thread.id),
            ),
          })),
        { revalidate: false, populateCache: true },
      ).catch(() => {});
      removeCachedThreadsFromView({
        emailAccountId,
        viewKey,
        threadIds: removedThreadIds,
      }).catch(() => {});

      return { viewIdentity, entries };
    },
    [data, emailAccountId, mutate, persistentThreads, viewIdentity, viewKey],
  );

  const restoreThreads = useCallback(
    (removal: ThreadRemoval, threadIds: string[]) => {
      if (removal.viewIdentity !== viewIdentity) return;

      const restoring = threadIds
        .map((id) => removal.entries.get(id))
        .filter((entry): entry is RemovedThread => entry !== undefined);
      if (!restoring.length) return;

      for (const entry of restoring) removal.entries.delete(entry.thread.id);
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
          .map(({ thread, index, threadOrder }) => ({
            thread,
            index,
            threadOrder,
          })),
      }).catch(() => {});
    },
    [emailAccountId, mutate, viewIdentity, viewKey],
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
      for (const threadId of changedThreadIds) {
        optimisticUpdateTokens.current.set(threadId, updateToken);
      }

      const applyThreadUpdates = (updates: ReadonlyMap<string, ListThread>) => {
        if (!updates.size) return;
        setPersistent((current) =>
          current?.identity === viewIdentity
            ? {
                ...current,
                threads: replaceThreads(current.threads, updates),
              }
            : current,
        );
        mutate(
          (pages) =>
            pages?.map((page) => ({
              ...page,
              threads: replaceThreads(page.threads, updates),
            })),
          { revalidate: false, populateCache: true },
        ).catch(() => {});
        writeCachedThreadRows({
          emailAccountId,
          threads: [...updates.values()],
        }).catch(() => {});
      };

      applyThreadUpdates(updatedById);

      const isLatestUpdate = (threadId: string) =>
        optimisticUpdateTokens.current.get(threadId) === updateToken;

      return {
        threadIds: changedThreadIds,
        commit: (threadId) => {
          if (isLatestUpdate(threadId)) {
            optimisticUpdateTokens.current.delete(threadId);
          }
        },
        rollback: (threadId) => {
          if (!isLatestUpdate(threadId)) return;

          optimisticUpdateTokens.current.delete(threadId);
          const previous = previousById.get(threadId);
          if (previous) {
            applyThreadUpdates(new Map([[threadId, previous]]));
          }
        },
      };
    },
    [emailAccountId, mutate, sourceThreads, viewIdentity],
  );

  const hasMore = data
    ? Boolean(data.at(-1)?.nextPageToken)
    : persistent?.identity === viewIdentity && persistent.hasMore;

  return {
    threads,
    isLoading: isLoading && !sourceThreads,
    error: sourceThreads ? undefined : error,
    hasMore: Boolean(hasMore),
    isLoadingMore:
      paginationRequestIdentity === viewIdentity ||
      (size > 1 && !data?.[size - 1]),
    loadMore: useCallback(() => {
      if (data) {
        setSize((current) => current + 1).catch(() => {});
      } else {
        paginationRetryIdentity.current = undefined;
        setPaginationRequestIdentity(viewIdentity);
      }
    }, [data, setSize, viewIdentity]),
    removeThreads,
    restoreThreads,
    optimisticallyUpdateThreads,
  };
}

const EMPTY_THREAD_IDS = new Set<string>();

function replaceThreads(
  threads: ListThread[],
  replacements: ReadonlyMap<string, ListThread>,
) {
  return threads.map((thread) => replacements.get(thread.id) ?? thread);
}

function insertRestoredThreads(
  threads: ListThread[],
  restoring: Array<Pick<RemovedThread, "thread" | "index" | "threadOrder">>,
) {
  if (!restoring.length) return threads;
  const threadsById = new Map(
    [...threads, ...restoring.map((entry) => entry.thread)].map((thread) => [
      thread.id,
      thread,
    ]),
  );
  return restoreThreadOrder(
    threads.map((thread) => thread.id),
    restoring.map(({ thread, index, threadOrder }) => ({
      threadId: thread.id,
      index,
      threadOrder,
    })),
  )
    .map((threadId) => threadsById.get(threadId))
    .filter((thread): thread is ListThread => thread !== undefined);
}
