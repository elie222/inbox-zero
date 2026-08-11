"use client";

import { useCallback, useMemo, useRef } from "react";
import useSWRInfinite from "swr/infinite";
import type { ThreadsListResponse } from "@/app/api/threads/route";
import type { ListThread } from "@/app/(app)/[emailAccountId]/mail/types";
import type { ThreadsQuery } from "@/utils/threads/validation";
import { createSearchParams } from "@/utils/url";

type RemovedThread = { thread: ListThread; pageIndex: number; index: number };

// Only the most recent removals can still be undone, so the retained rows are
// capped rather than accumulating for the whole session.
const MAX_RETAINED_REMOVALS = 200;

/**
 * One SWR key per split, so switching splits reads from cache instead of
 * refetching, and each split asks the server for its own rows rather than
 * filtering pages that happen to be loaded.
 */
export function useMailThreads(query: ThreadsQuery) {
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

      return `/api/threads?${params.toString()}`;
    },
    [query],
  );

  const { data, size, setSize, isLoading, error, mutate } =
    useSWRInfinite<ThreadsListResponse>(getKey, {
      keepPreviousData: true,
      revalidateOnFocus: false,
      revalidateFirstPage: false,
    });

  const threads: ListThread[] = useMemo(
    () => data?.flatMap((page) => page.threads) ?? [],
    [data],
  );

  // Rows are kept so an undo can put back exactly what it removed. Revalidating
  // instead would also resurrect rows that a *different* batch is still
  // archiving, since the server hasn't caught up with those yet.
  const removed = useRef(new Map<string, RemovedThread>());

  const removeThreads = useCallback(
    (threadIds: string[]) => {
      if (!threadIds.length) return;
      const targets = new Set(threadIds);

      // Optimistic: drop the rows now and don't revalidate, so triage keeps its
      // rhythm instead of the list flickering back after every archive.
      mutate(
        (pages) =>
          pages?.map((page, pageIndex) => ({
            ...page,
            threads: page.threads.filter((thread, index) => {
              if (!targets.has(thread.id)) return true;
              removed.current.set(thread.id, { thread, pageIndex, index });
              return false;
            }),
          })),
        { revalidate: false, populateCache: true, rollbackOnError: true },
      );

      while (removed.current.size > MAX_RETAINED_REMOVALS) {
        const oldest = removed.current.keys().next().value;
        if (oldest === undefined) break;
        removed.current.delete(oldest);
      }
    },
    [mutate],
  );

  const restoreThreads = useCallback(
    (threadIds: string[]) => {
      const restoring = threadIds
        .map((id) => removed.current.get(id))
        .filter((entry): entry is RemovedThread => entry !== undefined);
      if (!restoring.length) return;

      for (const entry of restoring) removed.current.delete(entry.thread.id);

      mutate(
        (pages) =>
          pages?.map((page, pageIndex) => {
            const forPage = restoring
              .filter((entry) => entry.pageIndex === pageIndex)
              .sort((a, b) => a.index - b.index);
            if (!forPage.length) return page;

            const threads = [...page.threads];
            for (const entry of forPage) {
              threads.splice(
                Math.min(entry.index, threads.length),
                0,
                entry.thread,
              );
            }
            return { ...page, threads };
          }),
        { revalidate: false, populateCache: true },
      );
    },
    [mutate],
  );

  return {
    threads,
    isLoading,
    error,
    hasMore: Boolean(data?.at(-1)?.nextPageToken),
    isLoadingMore: isLoading || (size > 0 && !data?.[size - 1]),
    loadMore: useCallback(() => setSize((current) => current + 1), [setSize]),
    removeThreads,
    restoreThreads,
  };
}
