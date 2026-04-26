"use client";

import { memo, useEffect } from "react";
import { resetTotalThreads, useQueueState } from "@/store/archive-queue";
import { useArchiveQueueProgress } from "@/store/archive-sender-queue";
import { ProgressPanel } from "@/components/ProgressPanel";
import { useAccount } from "@/providers/EmailAccountProvider";

export const ArchiveProgress = memo(() => {
  const { emailAccountId } = useAccount();
  const { totalThreads, activeThreads } = useQueueState();
  const bulkArchiveProgress = useArchiveQueueProgress(emailAccountId);

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
