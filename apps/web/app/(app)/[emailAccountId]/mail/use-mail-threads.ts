"use client";

import { useCallback, useMemo } from "react";
import useSWRInfinite from "swr/infinite";
import type { ThreadsListResponse } from "@/app/api/threads/route";
import type { ListThread } from "@/app/(app)/[emailAccountId]/mail/types";
import type { ThreadsQuery } from "@/utils/threads/validation";
import { createSearchParams } from "@/utils/url";

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

  const removeThreads = useCallback(
    (threadIds: string[]) => {
      if (!threadIds.length) return;
      const removed = new Set(threadIds);

      // Optimistic: drop the rows now and don't revalidate, so triage keeps its
      // rhythm instead of the list flickering back after every archive.
      mutate(
        (pages) =>
          pages?.map((page) => ({
            ...page,
            threads: page.threads.filter((thread) => !removed.has(thread.id)),
          })),
        { revalidate: false, populateCache: true, rollbackOnError: true },
      );
    },
    [mutate],
  );

  const restoreThreads = useCallback(() => mutate(), [mutate]);

  return {
    threads,
    isLoading,
    error,
    hasMore: data ? Boolean(data.at(-1)?.nextPageToken) : false,
    isLoadingMore:
      isLoading || (size > 0 && data && typeof data[size - 1] === "undefined"),
    loadMore: useCallback(() => setSize((current) => current + 1), [setSize]),
    removeThreads,
    restoreThreads,
  };
}
