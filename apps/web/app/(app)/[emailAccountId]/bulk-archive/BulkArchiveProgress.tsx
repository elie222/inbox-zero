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

  const { data } = useSWR<CategorizeProgress>(
    "/api/user/categorize/senders/progress",
    {
      refreshInterval: isBulkCategorizing ? 1000 : undefined,
    },
  );

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
    isBulkCategorizing ? 1500 : null,
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

  if (!isBulkCategorizing || !data?.totalItems) {
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
