"use client";

import { useCallback, useMemo } from "react";
import useSWRInfinite from "swr/infinite";
import type { ThreadsListResponse } from "@/app/api/threads/route";
import type { ListThread } from "@/app/(app)/[emailAccountId]/mail/types";
import type { ThreadsQuery } from "@/utils/threads/validation";
import { createSearchParams } from "@/utils/url";

type RemovedThread = { thread: ListThread; pageIndex: number; index: number };

/**
 * The rows one `removeThreads` call took out, and the view they came from.
 * Returned to the caller so an undo can put back exactly those rows — and only
 * while the list is still showing the split they were removed from.
 */
export type ThreadRemoval = {
  cacheKey: string;
  entries: Map<string, RemovedThread>;
};

/**
 * One SWR key per split, so switching splits reads from cache instead of
 * refetching, and each split asks the server for its own rows rather than
 * filtering pages that happen to be loaded.
 */
export function useMailThreads(query: ThreadsQuery) {
  // Identifies the split these rows belong to, so a restore can't drop them
  // into a different split's cache after the user switches tabs.
  const cacheKey = useMemo(
    () => createSearchParams({ ...query, view: "list" }).toString(),
    [query],
  );

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

  const removeThreads = useCallback(
    (threadIds: string[]): ThreadRemoval => {
      const entries = new Map<string, RemovedThread>();
      const targets = new Set(threadIds);

      // Optimistic: drop the rows now and don't revalidate, so triage keeps its
      // rhythm instead of the list flickering back after every archive. The
      // rows come back with the handle so an undo can reinstate them without a
      // refetch — which would also resurrect rows another batch is still
      // archiving, since the server hasn't caught up with those yet.
      if (threadIds.length) {
        mutate(
          (pages) =>
            pages?.map((page, pageIndex) => ({
              ...page,
              threads: page.threads.filter((thread, index) => {
                if (!targets.has(thread.id)) return true;
                entries.set(thread.id, { thread, pageIndex, index });
                return false;
              }),
            })),
          { revalidate: false, populateCache: true, rollbackOnError: true },
        );
      }

      return { cacheKey, entries };
    },
    [mutate, cacheKey],
  );

  const restoreThreads = useCallback(
    (removal: ThreadRemoval, threadIds: string[]) => {
      // The entries describe positions within the split they were removed from.
      // If the user has since switched splits, putting them back here would
      // show rows that don't match this view's query.
      if (removal.cacheKey !== cacheKey) return;

      const restoring = threadIds
        .map((id) => removal.entries.get(id))
        .filter((entry): entry is RemovedThread => entry !== undefined);
      if (!restoring.length) return;

      for (const entry of restoring) removal.entries.delete(entry.thread.id);

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
    [mutate, cacheKey],
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
