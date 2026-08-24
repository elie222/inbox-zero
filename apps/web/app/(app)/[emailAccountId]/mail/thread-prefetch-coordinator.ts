"use client";

import { useEffect, useMemo } from "react";
import type { Cache, ScopedMutator } from "swr";
import { unstable_serialize, useSWRConfig } from "swr";
import { prefetchThreadDetail, shouldPrefetchThreads } from "./thread-prefetch";
import {
  createThreadRequest,
  isThreadRequestInFlight,
} from "@/utils/email-cache/thread-request";

export const MAX_CONCURRENT_THREAD_PREFETCHES = 2;
export const MAX_QUEUED_THREAD_PREFETCHES = 6;

const PRIORITY_ORDER = {
  nearby: 0,
  focused: 1,
  adjacent: 2,
  hover: 3,
} as const;

export type ThreadPrefetchPriority = keyof typeof PRIORITY_ORDER;

export type ThreadPrefetchJob = {
  emailAccountId: string;
  threadId: string;
  priority: ThreadPrefetchPriority;
  scopeKey: string;
};

type ScheduledPrefetchJob = ThreadPrefetchJob & {
  cacheIdentity: string;
  coordinatorGeneration: number;
  enqueuedAt: number;
  requestKey: ReturnType<typeof unstable_serialize>;
  scopeVersion: number;
};

type ThreadPrefetchQueueEntry = {
  job: ScheduledPrefetchJob;
  status: "active" | "queued";
};

export type ThreadPrefetchCoordinator = {
  activate: () => void;
  cancelScope: (scopeKey: string) => void;
  dispose: () => void;
  schedule: (job: ThreadPrefetchJob) => void;
  scheduleMany: (jobs: ThreadPrefetchJob[]) => void;
};

export function createThreadPrefetchCoordinator({
  cache,
  fetcher,
  mutate,
}: {
  cache: Cache<unknown>;
  fetcher: ((key: [string, string]) => unknown) | null | undefined;
  mutate: ScopedMutator;
}): ThreadPrefetchCoordinator {
  let activeCount = 0;
  let coordinatorGeneration = 0;
  let disposed = false;
  let sequence = 0;
  const jobsByIdentity = new Map<string, ThreadPrefetchQueueEntry>();
  const scopeVersions = new Map<string, number>();

  const getScopeVersion = (scopeKey: string) =>
    scopeVersions.get(scopeKey) ?? 0;

  const shouldSkipJob = (
    job: Pick<ScheduledPrefetchJob, "cacheIdentity" | "requestKey">,
  ) =>
    cache.get(job.requestKey)?.data !== undefined ||
    isThreadRequestInFlight({ cacheIdentity: job.cacheIdentity });

  const isCancelled = (
    job: Pick<
      ScheduledPrefetchJob,
      "coordinatorGeneration" | "scopeKey" | "scopeVersion"
    >,
  ) =>
    disposed ||
    job.coordinatorGeneration !== coordinatorGeneration ||
    getScopeVersion(job.scopeKey) !== job.scopeVersion;

  const dropQueuedOverflow = () => {
    const queued = [...jobsByIdentity.values()]
      .filter((entry) => entry.status === "queued")
      .sort(compareQueuedEntries);
    while (queued.length > MAX_QUEUED_THREAD_PREFETCHES) {
      const entry = queued.shift();
      if (!entry) break;
      jobsByIdentity.delete(entry.job.cacheIdentity);
    }
  };

  const pumpQueue = () => {
    if (
      disposed ||
      activeCount >= MAX_CONCURRENT_THREAD_PREFETCHES ||
      !fetcher ||
      !shouldPrefetchThreads()
    ) {
      return;
    }

    const next = [...jobsByIdentity.values()]
      .filter((entry) => entry.status === "queued")
      .sort(compareQueuedEntries)
      .at(-1);
    if (!next) return;
    if (shouldSkipJob(next.job) || isCancelled(next.job)) {
      jobsByIdentity.delete(next.job.cacheIdentity);
      pumpQueue();
      return;
    }

    next.status = "active";
    activeCount += 1;
    prefetchThreadDetail({
      emailAccountId: next.job.emailAccountId,
      threadId: next.job.threadId,
      fetcher,
      mutate,
      isCancelled: () => isCancelled(next.job),
    })
      .catch(() => {
        // Prefetch failures are intentionally silent; opening still retries normally.
      })
      .finally(() => {
        activeCount -= 1;
        const current = jobsByIdentity.get(next.job.cacheIdentity);
        if (current === next) jobsByIdentity.delete(next.job.cacheIdentity);
        pumpQueue();
      });

    if (activeCount < MAX_CONCURRENT_THREAD_PREFETCHES) {
      pumpQueue();
    }
  };

  const schedule = (job: ThreadPrefetchJob) => {
    if (disposed || !fetcher || !shouldPrefetchThreads()) return;

    const request = createThreadRequest({
      emailAccountId: job.emailAccountId,
      threadId: job.threadId,
      options: { includeDrafts: true },
    });
    const scheduledJob: ScheduledPrefetchJob = {
      ...job,
      cacheIdentity: request.cacheIdentity,
      coordinatorGeneration,
      enqueuedAt: sequence,
      requestKey: unstable_serialize(request.key),
      scopeVersion: getScopeVersion(job.scopeKey),
    };
    sequence += 1;

    if (shouldSkipJob(scheduledJob)) return;
    const existing = jobsByIdentity.get(request.cacheIdentity);
    if (existing) {
      if (existing.status === "queued") {
        existing.job = mergeQueuedJobs(existing.job, scheduledJob);
        dropQueuedOverflow();
        pumpQueue();
      }
      return;
    }

    jobsByIdentity.set(request.cacheIdentity, {
      job: scheduledJob,
      status: "queued",
    });
    dropQueuedOverflow();
    pumpQueue();
  };

  const scheduleMany = (jobs: ThreadPrefetchJob[]) => {
    for (const job of jobs) {
      schedule(job);
    }
  };

  const cancelScope = (scopeKey: string) => {
    scopeVersions.set(scopeKey, getScopeVersion(scopeKey) + 1);
    for (const [cacheIdentity, entry] of jobsByIdentity.entries()) {
      if (entry.status === "queued" && entry.job.scopeKey === scopeKey) {
        jobsByIdentity.delete(cacheIdentity);
      }
    }
  };

  const activate = () => {
    disposed = false;
  };

  const dispose = () => {
    disposed = true;
    coordinatorGeneration += 1;
    jobsByIdentity.clear();
    scopeVersions.clear();
  };

  return {
    activate,
    cancelScope,
    dispose,
    schedule,
    scheduleMany,
  };
}

export function useThreadPrefetchCoordinator() {
  const { cache, fetcher, mutate } = useSWRConfig();
  const coordinator = useMemo(
    () => createThreadPrefetchCoordinator({ cache, fetcher, mutate }),
    [cache, fetcher, mutate],
  );

  useEffect(() => {
    coordinator.activate();
    return () => coordinator.dispose();
  }, [coordinator]);

  return coordinator;
}

function compareQueuedEntries(
  left: ThreadPrefetchQueueEntry,
  right: ThreadPrefetchQueueEntry,
) {
  return (
    PRIORITY_ORDER[left.job.priority] - PRIORITY_ORDER[right.job.priority] ||
    right.job.enqueuedAt - left.job.enqueuedAt
  );
}

function mergeQueuedJobs(
  existing: ScheduledPrefetchJob,
  incoming: ScheduledPrefetchJob,
): ScheduledPrefetchJob {
  if (PRIORITY_ORDER[incoming.priority] > PRIORITY_ORDER[existing.priority]) {
    return incoming;
  }

  return {
    ...incoming,
    priority: existing.priority,
  };
}
