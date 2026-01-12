"use client";

import { useEffect, useState } from "react";
import useSWR from "swr";
import { ProgressPanel } from "@/components/ProgressPanel";
import type { CategorizeProgress } from "@/app/api/user/categorize/senders/progress/route";
import { useCategorizeProgress } from "@/app/(app)/[emailAccountId]/smart-categories/CategorizeProgress";
import { useInterval } from "@/hooks/useInterval";

export function BulkArchiveProgress({
  onComplete,
}: {
  onComplete?: () => void;
}) {
  const { isBulkCategorizing, setIsBulkCategorizing } = useCategorizeProgress();
  const [fakeProgress, setFakeProgress] = useState(0);

  // Check if there's active progress (categorization in progress from server)
  const { data } = useSWR<CategorizeProgress>(
    "/api/user/categorize/senders/progress",
    {
      refreshInterval: 1000, // Always poll to detect ongoing categorization
    },
  );

  // Categorization is active if explicitly set OR if server shows incomplete progress
  const hasActiveProgress =
    data?.totalItems && data.completedItems < data.totalItems;
  const isCategorizationActive = isBulkCategorizing || hasActiveProgress;

  // Sync local state with server state
  useEffect(() => {
    if (hasActiveProgress && !isBulkCategorizing) {
      setIsBulkCategorizing(true);
    }
  }, [hasActiveProgress, isBulkCategorizing, setIsBulkCategorizing]);

  // Fake progress animation to make it feel responsive
  useInterval(
    () => {
      if (!data?.totalItems) return;

      setFakeProgress((prev) => {
        const realCompleted = data.completedItems || 0;
        if (realCompleted > prev) return realCompleted;

        const maxProgress = Math.min(
          Math.floor(data.totalItems * 0.9),
          realCompleted + 30,
        );
        return prev < maxProgress ? prev + 1 : prev;
      });
    },
    isCategorizationActive ? 1500 : null,
  );

  // Handle completion
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | undefined;
    if (
      data?.completedItems &&
      data?.totalItems &&
      data.completedItems === data.totalItems
    ) {
      timeoutId = setTimeout(() => {
        setIsBulkCategorizing(false);
        setFakeProgress(0);
        onComplete?.();
      }, 3000);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [
    data?.completedItems,
    data?.totalItems,
    setIsBulkCategorizing,
    onComplete,
  ]);

  if (!isCategorizationActive || !data?.totalItems) {
    return null;
  }

  const totalItems = data.totalItems || 0;
  const displayedProgress = Math.max(data.completedItems || 0, fakeProgress);

  return (
    <ProgressPanel
      totalItems={totalItems}
      remainingItems={totalItems - displayedProgress}
      inProgressText="Categorizing senders..."
      completedText={`Categorization complete! ${displayedProgress} senders categorized!`}
      itemLabel="senders"
    />
  );
}
