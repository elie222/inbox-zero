"use client";

import { useEffect } from "react";
import { ProgressPanel } from "@/components/ProgressPanel";
import { useArchiveQueueProgress } from "@/store/archive-sender-queue";
import { useAccount } from "@/providers/EmailAccountProvider";

export function BulkArchiveProgress({
  onComplete,
}: {
  onComplete?: () => void;
}) {
  const { emailAccountId } = useAccount();
  const progress = useArchiveQueueProgress(emailAccountId);
  const totalItems = progress?.totalItems ?? 0;
  const completedItems = progress?.completedItems ?? 0;
  const failedItems = progress?.failedItems ?? 0;
  const activeItems = progress?.activeItems ?? 0;
  const settledItems = progress?.settledItems ?? 0;
  const hasActiveProgress = activeItems > 0;
  const hasSettledProgress = !!totalItems && settledItems === totalItems;

  useEffect(() => {
    let timeoutId: NodeJS.Timeout | undefined;
    if (hasSettledProgress) {
      timeoutId = setTimeout(() => {
        onComplete?.();
      }, 3000);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [hasSettledProgress, onComplete]);

  if ((!hasActiveProgress && !hasSettledProgress) || !totalItems) {
    return null;
  }

  const failedSuffix = failedItems ? ` ${failedItems} failed.` : "";

  return (
    <ProgressPanel
      totalItems={totalItems}
      remainingItems={activeItems}
      inProgressText={`Archiving ${Math.min(settledItems + 1, totalItems)} of ${totalItems} senders...${failedSuffix}`}
      completedText={
        failedItems
          ? `Archiving finished: ${completedItems} succeeded, ${failedItems} failed.`
          : `Archiving complete! ${completedItems} senders processed!`
      }
      itemLabel="senders"
    />
  );
}
