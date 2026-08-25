"use client";

import { useEffect, useMemo } from "react";
import type { ListThread } from "./types";
import type { ThreadPrefetchCoordinator } from "./thread-prefetch-coordinator";

export const PREDICTIVE_THREAD_PREFETCH_DELAY_MS = 120;
export const PREDICTIVE_THREAD_PREFETCH_NEARBY_WINDOW = 1;

export function usePredictiveThreadPrefetch({
  coordinator,
  emailAccountId,
  enabled,
  focusedIndex,
  scopeKey,
  threads,
}: {
  coordinator: ThreadPrefetchCoordinator;
  emailAccountId: string;
  enabled: boolean;
  focusedIndex: number;
  scopeKey: string;
  threads: ListThread[];
}) {
  const jobs = useMemo(() => {
    if (!enabled) return [];

    const ids = new Set<string>();
    const scheduled: Array<{
      priority: "focused" | "nearby";
      threadId: string;
    }> = [];
    for (
      let index = focusedIndex - PREDICTIVE_THREAD_PREFETCH_NEARBY_WINDOW;
      index <= focusedIndex + PREDICTIVE_THREAD_PREFETCH_NEARBY_WINDOW;
      index += 1
    ) {
      const thread = threads[index];
      if (!thread || "account" in thread || ids.has(thread.id)) continue;
      ids.add(thread.id);
      scheduled.push({
        priority: index === focusedIndex ? "focused" : "nearby",
        threadId: thread.id,
      });
    }

    return scheduled;
  }, [enabled, focusedIndex, threads]);

  useEffect(() => {
    coordinator.cancelScope(scopeKey);
    if (!jobs.length) return;

    const schedule = () => {
      coordinator.scheduleMany(
        jobs.map((job) => ({
          emailAccountId,
          priority: job.priority,
          scopeKey,
          threadId: job.threadId,
        })),
      );
    };

    const idleCallback = window.requestIdleCallback?.(schedule, {
      timeout: 800,
    });
    const timeout =
      idleCallback === undefined
        ? window.setTimeout(schedule, PREDICTIVE_THREAD_PREFETCH_DELAY_MS)
        : undefined;

    return () => {
      coordinator.cancelScope(scopeKey);
      if (idleCallback !== undefined) window.cancelIdleCallback(idleCallback);
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [coordinator, emailAccountId, jobs, scopeKey]);
}
