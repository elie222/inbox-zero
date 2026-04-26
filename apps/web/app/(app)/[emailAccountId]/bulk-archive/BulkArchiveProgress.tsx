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
  const hasActiveProgress = !!totalItems && completedItems < totalItems;
  const hasCompletedProgress = !!totalItems && completedItems === totalItems;

  useEffect(() => {
    let timeoutId: NodeJS.Timeout | undefined;
    if (hasCompletedProgress) {
      timeoutId = setTimeout(() => {
        onComplete?.();
      }, 3000);
    }
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [hasCompletedProgress, onComplete]);

  if ((!hasActiveProgress && !hasCompletedProgress) || !totalItems) {
    return null;
  }

  return (
    <ProgressPanel
      totalItems={totalItems}
      remainingItems={totalItems - completedItems}
      inProgressText={`Archiving ${Math.min(completedItems + 1, totalItems)} of ${totalItems} senders...`}
      completedText={`Archiving complete! ${completedItems} senders processed!`}
      itemLabel="senders"
    />
  );
}
