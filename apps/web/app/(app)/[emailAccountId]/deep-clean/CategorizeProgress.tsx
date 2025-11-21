"use client";

import { useEffect, useState } from "react";
import { atom, useAtom } from "jotai";
import useSWR from "swr";
import { ProgressPanel } from "@/components/ProgressPanel";
import type { CategorizeProgress } from "@/app/api/user/categorize/senders/progress/route";
import { useInterval } from "@/hooks/useInterval";

const isCategorizeInProgressAtom = atom(false);

export function useCategorizeProgress() {
  const [isBulkCategorizing, setIsBulkCategorizing] = useAtom(
    isCategorizeInProgressAtom,
  );
  return { isBulkCategorizing, setIsBulkCategorizing };
}

export function CategorizeSendersProgress({
  refresh = false,
}: {
  refresh: boolean;
}) {
  const { isBulkCategorizing } = useCategorizeProgress();
  const [fakeProgress, setFakeProgress] = useState(0);

  const { data } = useSWR<CategorizeProgress>(
    "/api/user/categorize/senders/progress",
    {
      refreshInterval: refresh || isBulkCategorizing ? 1000 : undefined,
    },
  );

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

  const { setIsBulkCategorizing } = useCategorizeProgress();
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | undefined;
    if (data?.completedItems === data?.totalItems) {
      timeoutId = setTimeout(() => {
        setIsBulkCategorizing(false);
        setFakeProgress(0);
      }, 3000);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [data?.completedItems, data?.totalItems, setIsBulkCategorizing]);

  if (!data) return null;

  const totalItems = data.totalItems || 0;
  const displayedProgress = Math.max(data.completedItems || 0, fakeProgress);

  return (
    <ProgressPanel
      totalItems={totalItems}
      remainingItems={totalItems - displayedProgress}
      inProgressText="Categorizing senders..."
      completedText={`Categorization complete! ${displayedProgress} categorized!`}
      itemLabel="senders"
    />
  );
}
