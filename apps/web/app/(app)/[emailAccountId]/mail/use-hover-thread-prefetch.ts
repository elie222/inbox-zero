"use client";

import { useCallback, useEffect, useRef } from "react";
import type { ThreadPrefetchCoordinator } from "./thread-prefetch-coordinator";

export const HOVER_PREFETCH_DELAY_MS = 90;

/**
 * Warms a thread's detail caches when a row signals open intent (pointer
 * dwell, focus, or the J/K cursor settling on it), so opening feels instant.
 */
export function useHoverThreadPrefetch({
  coordinator,
  emailAccountId,
  scopeKey,
}: {
  coordinator: ThreadPrefetchCoordinator;
  emailAccountId: string;
  scopeKey: string;
}) {
  const timerRef = useRef<number | undefined>(undefined);

  const cancelPrefetch = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
  }, []);

  const schedulePrefetch = useCallback(
    (threadId: string) => {
      cancelPrefetch();
      // The dwell delay keeps sweeping the pointer (or holding J/K) across
      // rows from firing a fetch per row.
      timerRef.current = window.setTimeout(() => {
        timerRef.current = undefined;
        coordinator.schedule({
          emailAccountId,
          priority: "hover",
          scopeKey,
          threadId,
        });
      }, HOVER_PREFETCH_DELAY_MS);
    },
    [cancelPrefetch, coordinator, emailAccountId, scopeKey],
  );

  useEffect(
    () => () => {
      cancelPrefetch();
      coordinator.cancelScope(scopeKey);
    },
    [cancelPrefetch, coordinator, scopeKey],
  );

  return { schedulePrefetch, cancelPrefetch };
}
