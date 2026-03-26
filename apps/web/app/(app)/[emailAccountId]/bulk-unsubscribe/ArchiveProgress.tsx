"use client";

import { memo, useEffect } from "react";
import useSWR from "swr";
import type { BulkArchiveProgress } from "@/app/api/user/bulk-archive/progress/route";
import { resetTotalThreads, useQueueState } from "@/store/archive-queue";
import { ProgressPanel } from "@/components/ProgressPanel";

export const ArchiveProgress = memo(() => {
  const { totalThreads, activeThreads } = useQueueState();
  const { data: bulkArchiveProgress } = useSWR<BulkArchiveProgress>(
    "/api/user/bulk-archive/progress",
    {
      refreshInterval: 1000,
    },
  );

  const hasBackendProgress = Boolean(bulkArchiveProgress?.totalItems);
  const threadsRemaining = Object.values(activeThreads || {}).length;
  const totalProcessed = totalThreads - threadsRemaining;
  const localProgress =
    totalThreads > 0 ? (totalProcessed / totalThreads) * 100 : 0;
  const isLocalCompleted = localProgress === 100;

  useEffect(() => {
    if (isLocalCompleted) {
      setTimeout(() => {
        resetTotalThreads();
      }, 5000);
    }
  }, [isLocalCompleted]);

  if (hasBackendProgress) {
    return (
      <ProgressPanel
        totalItems={bulkArchiveProgress?.totalItems || 0}
        remainingItems={
          (bulkArchiveProgress?.totalItems || 0) -
          (bulkArchiveProgress?.completedItems || 0)
        }
        inProgressText="Archiving senders..."
        completedText="Archiving complete!"
        itemLabel="senders"
      />
    );
  }

  return (
    <ProgressPanel
      totalItems={totalThreads}
      remainingItems={threadsRemaining}
      inProgressText="Archiving emails..."
      completedText="Archiving complete!"
      itemLabel="emails"
    />
  );
});
