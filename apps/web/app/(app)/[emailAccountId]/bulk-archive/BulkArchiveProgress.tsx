"use client";

import { useEffect } from "react";
import useSWR from "swr";
import { ProgressPanel } from "@/components/ProgressPanel";
import type { CategorizeProgress } from "@/app/api/user/categorize/senders/progress/route";
import { useCategorizeProgress } from "@/app/(app)/[emailAccountId]/smart-categories/CategorizeProgress";

export function BulkArchiveProgress({
  onComplete,
}: {
  onComplete?: () => void;
}) {
  const { isBulkCategorizing, setIsBulkCategorizing } = useCategorizeProgress();

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
  const hasCompletedProgress =
    !!data?.totalItems && data.completedItems === data.totalItems;
  const isCategorizationVisible =
    isBulkCategorizing || hasActiveProgress || hasCompletedProgress;

  // Sync local state with server state
  useEffect(() => {
    if (hasActiveProgress && !isBulkCategorizing) {
      setIsBulkCategorizing(true);
    }
  }, [hasActiveProgress, isBulkCategorizing, setIsBulkCategorizing]);

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

  if (!isCategorizationVisible || !data?.totalItems) {
    return null;
  }

  const totalItems = data.totalItems || 0;
  const completedItems = data.completedItems || 0;

  return (
    <ProgressPanel
      totalItems={totalItems}
      remainingItems={totalItems - completedItems}
      inProgressText="Categorizing senders..."
      completedText={`Categorization complete! ${completedItems} senders categorized!`}
      itemLabel="senders"
    />
  );
}
