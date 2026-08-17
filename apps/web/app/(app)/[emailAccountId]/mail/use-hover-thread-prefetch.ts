"use client";

import { useCallback, useEffect, useRef } from "react";
import { unstable_serialize, useSWRConfig } from "swr";
import {
  prefetchThreadDetail,
  shouldPrefetchThreads,
} from "@/app/(app)/[emailAccountId]/mail/thread-prefetch";
import {
  createThreadRequest,
  isThreadRequestInFlight,
} from "@/utils/email-cache/thread-request";

export const HOVER_PREFETCH_DELAY_MS = 90;

/**
 * Warms a thread's detail caches when a row signals open intent (pointer
 * dwell, focus, or the J/K cursor settling on it), so opening feels instant.
 */
export function useHoverThreadPrefetch({
  emailAccountId,
}: {
  emailAccountId: string;
}) {
  const { cache, fetcher, mutate } = useSWRConfig();
  const timerRef = useRef<number | undefined>(undefined);
  const isPrefetchingRef = useRef(false);
  const queuedThreadIdRef = useRef<string | null>(null);

  const runPrefetch = useCallback(
    function run(threadId: string) {
      if (isPrefetchingRef.current) {
        // One hover prefetch at a time; only the newest intent survives.
        queuedThreadIdRef.current = threadId;
        return;
      }
      if (!fetcher || !shouldPrefetchThreads()) return;
      const request = createThreadRequest({
        emailAccountId,
        threadId,
        options: { includeDrafts: true },
      });
      const alreadyCached =
        cache.get(unstable_serialize(request.key))?.data !== undefined;
      if (alreadyCached || isThreadRequestInFlight(request)) return;

      isPrefetchingRef.current = true;
      const finish = () => {
        isPrefetchingRef.current = false;
        const queued = queuedThreadIdRef.current;
        queuedThreadIdRef.current = null;
        if (queued) run(queued);
      };
      // Prefetch failures are intentionally silent; opening still retries normally.
      prefetchThreadDetail({ emailAccountId, threadId, fetcher, mutate }).then(
        finish,
        finish,
      );
    },
    [cache, emailAccountId, fetcher, mutate],
  );

  const cancelPrefetch = useCallback(() => {
    if (timerRef.current !== undefined) {
      window.clearTimeout(timerRef.current);
      timerRef.current = undefined;
    }
    queuedThreadIdRef.current = null;
  }, []);

  const schedulePrefetch = useCallback(
    (threadId: string) => {
      cancelPrefetch();
      // The dwell delay keeps sweeping the pointer (or holding J/K) across
      // rows from firing a fetch per row.
      timerRef.current = window.setTimeout(() => {
        timerRef.current = undefined;
        runPrefetch(threadId);
      }, HOVER_PREFETCH_DELAY_MS);
    },
    [cancelPrefetch, runPrefetch],
  );

  useEffect(() => cancelPrefetch, [cancelPrefetch]);

  return { schedulePrefetch, cancelPrefetch };
}
