"use client";

import { memo, useEffect } from "react";
import { resetTotalThreads, useQueueState } from "@/store/archive-queue";
import { ProgressPanel } from "@/components/ProgressPanel";

export const ArchiveProgress = memo(() => {
  const { totalThreads, activeThreads } = useQueueState();

  // Make sure activeThreads is an object as this was causing an error.
  const threadsRemaining = Object.values(activeThreads || {}).length;
  const totalProcessed = totalThreads - threadsRemaining;
  const progress = (totalProcessed / totalThreads) * 100;
  const isCompleted = progress === 100;

  useEffect(() => {
    if (isCompleted) {
      setTimeout(() => {
        resetTotalThreads();
      }, 5000);
    }
  }, [isCompleted]);

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
