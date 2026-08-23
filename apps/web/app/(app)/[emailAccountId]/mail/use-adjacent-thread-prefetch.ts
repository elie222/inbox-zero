"use client";

import { useEffect, useMemo } from "react";
import type { ThreadPrefetchCoordinator } from "./thread-prefetch-coordinator";

export function useAdjacentThreadPrefetch({
  coordinator,
  currentThreadId,
  emailAccountId,
  scopeKey,
  threadIds,
}: {
  coordinator: ThreadPrefetchCoordinator;
  currentThreadId: string | null;
  emailAccountId: string;
  scopeKey: string;
  threadIds: string[];
}) {
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
    coordinator.cancelScope(scopeKey);
    if (!adjacentThreadIds.length) return;

    const prefetch = () => {
      coordinator.scheduleMany(
        adjacentThreadIds.map((threadId) => ({
          emailAccountId,
          priority: "adjacent" as const,
          scopeKey,
          threadId,
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
  }, [adjacentThreadIds, coordinator, emailAccountId, scopeKey]);
}
