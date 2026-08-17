"use client";

import { useEffect, useMemo } from "react";
import { useSWRConfig } from "swr";
import {
  prefetchThreadDetail,
  shouldPrefetchThreads,
} from "@/app/(app)/[emailAccountId]/mail/thread-prefetch";

export function useAdjacentThreadPrefetch({
  currentThreadId,
  emailAccountId,
  threadIds,
}: {
  currentThreadId: string | null;
  emailAccountId: string;
  threadIds: string[];
}) {
  const { fetcher, mutate } = useSWRConfig();
  const adjacentThreadIds = useMemo(() => {
    const currentIndex = currentThreadId
      ? threadIds.indexOf(currentThreadId)
      : -1;
    if (currentIndex < 0) return [];
    return [threadIds[currentIndex - 1], threadIds[currentIndex + 1]].filter(
      (threadId): threadId is string => Boolean(threadId),
    );
  }, [currentThreadId, threadIds]);

  useEffect(() => {
    if (!fetcher || !shouldPrefetchThreads() || !adjacentThreadIds.length)
      return;
    let cancelled = false;

    const prefetch = () => {
      for (const threadId of adjacentThreadIds) {
        prefetchThreadDetail({
          emailAccountId,
          threadId,
          fetcher,
          mutate,
          isCancelled: () => cancelled,
        }).catch(() => {
          // Prefetch failures are intentionally silent; opening still retries normally.
        });
      }
    };

    const idleCallback = window.requestIdleCallback?.(prefetch, {
      timeout: 800,
    });
    const timeout =
      idleCallback === undefined ? window.setTimeout(prefetch, 150) : undefined;

    return () => {
      cancelled = true;
      if (idleCallback !== undefined) window.cancelIdleCallback(idleCallback);
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [adjacentThreadIds, emailAccountId, fetcher, mutate]);
}
