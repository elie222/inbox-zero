"use client";

import { useCallback, useEffect, useMemo, useRef } from "react";
import useSWRInfinite from "swr/infinite";
import type { GetAllThreadsResponse } from "@/app/api/threads/all/route";
import { getListThreadKey } from "@/app/(app)/[emailAccountId]/mail/types";
import type { EmailLabels } from "@/providers/email-label-types";
import { restoreThreadOrder } from "@/utils/email-cache/thread-order";
import { getThreadTimestamp } from "@/utils/threads/sort";
import { createSearchParams } from "@/utils/url";

type CombinedThreadRemoval = {
  thread: GetAllThreadsResponse["threads"][number];
  pageIndex: number;
  index: number;
  threadOrder: readonly string[];
};

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
  const { data, error, isLoading, size, setSize, mutate } =
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
      (left, right) => getThreadTimestamp(right) - getThreadTimestamp(left),
    );
  }, [data]);
  const hasMore = Boolean(data?.at(-1)?.nextPageToken);
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

  const removeThread = useCallback(
    (threadKey: string): CombinedThreadRemoval | undefined => {
      for (const [pageIndex, page] of (data ?? []).entries()) {
        const index = page.threads.findIndex(
          (thread) => getListThreadKey(thread) === threadKey,
        );
        const thread = page.threads[index];
        if (!thread) continue;
        const threadOrder = page.threads.map(getListThreadKey);

        mutate(
          (pages) =>
            pages?.map((currentPage) => ({
              ...currentPage,
              threads: currentPage.threads.filter(
                (item) => getListThreadKey(item) !== threadKey,
              ),
            })),
          { populateCache: true, revalidate: false },
        ).catch(() => {});
        return { thread, pageIndex, index, threadOrder };
      }
    },
    [data, mutate],
  );

  const restoreThread = useCallback(
    (removal: CombinedThreadRemoval) => {
      mutate(
        (pages) =>
          pages?.map((page, pageIndex) => {
            if (pageIndex !== removal.pageIndex) return page;
            if (
              page.threads.some(
                (thread) =>
                  getListThreadKey(thread) === getListThreadKey(removal.thread),
              )
            ) {
              return page;
            }

            const threadsByKey = new Map(
              [...page.threads, removal.thread].map((thread) => [
                getListThreadKey(thread),
                thread,
              ]),
            );
            const threadKeys = restoreThreadOrder(
              page.threads.map(getListThreadKey),
              [
                {
                  threadId: getListThreadKey(removal.thread),
                  index: removal.index,
                  threadOrder: removal.threadOrder,
                },
              ],
            );
            return {
              ...page,
              threads: threadKeys.flatMap((key) => {
                const thread = threadsByKey.get(key);
                return thread ? [thread] : [];
              }),
            };
          }),
        { populateCache: true, revalidate: false },
      ).catch(() => {});
    },
    [mutate],
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
    isLoading: isLoading && !threads.length,
    error: threads.length ? undefined : error,
    hasMore,
    isLoadingMore,
    failedAccountIds: [
      ...new Set(data?.flatMap((page) => page.failedAccountIds) ?? []),
    ],
    labelsByAccount,
    removeThread,
    restoreThread,
    loadMore: useCallback(() => {
      if (loadMoreLock.current || !hasMore) return;
      loadMoreLock.current = true;
      setSize((current) => current + 1).catch(() => {
        loadMoreLock.current = false;
      });
    }, [hasMore, setSize]),
  };
}
