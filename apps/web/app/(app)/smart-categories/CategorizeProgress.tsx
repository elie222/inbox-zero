"use client";

import { useEffect } from "react";
import { atom, useAtom } from "jotai";
import useSWR from "swr";
import { ProgressPanel } from "@/components/ProgressPanel";
import type { CategorizeProgress } from "@/app/api/user/categorize/senders/progress/route";

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
  const { data } = useSWR<CategorizeProgress>(
    "/api/user/categorize/senders/progress",
    {
      refreshInterval: refresh || isBulkCategorizing ? 1_000 : undefined,
    },
  );

  // If the categorization is complete, wait 3 seconds and then set isBulkCategorizing to false
  const { setIsBulkCategorizing } = useCategorizeProgress();
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | undefined;
    if (data?.completedItems === data?.totalItems) {
      timeoutId = setTimeout(() => {
        setIsBulkCategorizing(false);
      }, 3_000);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [data?.completedItems, data?.totalItems, setIsBulkCategorizing]);

  if (!data) return null;

  return (
    <ProgressPanel
      totalItems={data.totalItems}
      remainingItems={data.totalItems - data.completedItems}
      inProgressText={`Categorizing senders... ${data.completedItems || 0} categorized`}
      completedText={`Categorization complete! ${data.completedItems || 0} categorized!`}
      itemLabel="senders"
    />
  );
}
