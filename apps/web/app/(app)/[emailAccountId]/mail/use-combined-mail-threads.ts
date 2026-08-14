"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import useSWRInfinite from "swr/infinite";
import type { GetAllThreadsResponse } from "@/app/api/threads/all/route";
import type { ListThread } from "@/app/(app)/[emailAccountId]/mail/types";
import { internalDateToDate } from "@/utils/date";
import { createSearchParams } from "@/utils/url";

export function useCombinedMailThreads({
  enabled,
  isUnread,
}: {
  enabled: boolean;
  isUnread: boolean;
}) {
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
  const { data, error, isLoading, size, setSize } =
    useSWRInfinite<GetAllThreadsResponse>(getKey, {
      keepPreviousData: false,
      revalidateFirstPage: false,
      revalidateOnFocus: false,
    });
  const loadMoreLock = useRef(false);

  const threads = useMemo(() => {
    const byKey = new Map<string, GetAllThreadsResponse["threads"][number]>();
    for (const thread of data?.flatMap((page) => page.threads) ?? []) {
      byKey.set(`${thread.account.id}:${thread.id}`, thread);
    }
    return [...byKey.values()].sort(
      (left, right) => threadTimestamp(right) - threadTimestamp(left),
    );
  }, [data]);
  const hasMore = Boolean(data?.at(-1)?.nextPageToken);
  const isLoadingMore = size > 1 && !data?.[size - 1];

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
    isLoading: isLoading && !threads.length,
    error: threads.length ? undefined : error,
    hasMore,
    isLoadingMore,
    failedAccountIds: [
      ...new Set(data?.flatMap((page) => page.failedAccountIds) ?? []),
    ],
    loadMore: useCallback(() => {
      if (loadMoreLock.current || !hasMore) return;
      loadMoreLock.current = true;
      setSize((current) => current + 1).catch(() => {
        loadMoreLock.current = false;
      });
    }, [hasMore, setSize]),
  };
}

function threadTimestamp(thread: ListThread) {
  return (
    internalDateToDate(thread.messages.at(-1)?.internalDate, {
      fallbackToNow: false,
    }).getTime() || 0
  );
}
