"use client";

import { useEffect, useMemo } from "react";
import { getThreadSelectionKey, type ThreadSelection } from "./types";
import type { ThreadPrefetchCoordinator } from "./thread-prefetch-coordinator";

export function useAdjacentThreadPrefetch({
  coordinator,
  currentThread,
  scopeKey,
  threads,
}: {
  coordinator: ThreadPrefetchCoordinator;
  currentThread: ThreadSelection | null;
  scopeKey: string;
  threads: ThreadSelection[];
}) {
  const adjacentThreads = useMemo(() => {
    const currentThreadKey = getThreadSelectionKey(currentThread);
    const currentIndex = currentThreadKey
      ? threads.findIndex(
          (thread) => getThreadSelectionKey(thread) === currentThreadKey,
        )
      : -1;
    if (currentIndex < 0) return [];
    return [threads[currentIndex - 1], threads[currentIndex + 1]].filter(
      (thread): thread is ThreadSelection => Boolean(thread),
    );
  }, [currentThread, threads]);

  useEffect(() => {
    coordinator.cancelScope(scopeKey);
    if (!adjacentThreads.length) return;

    const prefetch = () => {
      coordinator.scheduleMany(
        adjacentThreads.map((thread) => ({
          emailAccountId: thread.emailAccountId,
          priority: "adjacent" as const,
          scopeKey,
          threadId: thread.threadId,
        })),
      );
    };

    const idleCallback = window.requestIdleCallback?.(prefetch, {
      timeout: 800,
    });
    const timeout =
      idleCallback === undefined ? window.setTimeout(prefetch, 150) : undefined;

    return () => {
      coordinator.cancelScope(scopeKey);
      if (idleCallback !== undefined) window.cancelIdleCallback(idleCallback);
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [adjacentThreads, coordinator, scopeKey]);
}
