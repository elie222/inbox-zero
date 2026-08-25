"use client";

import { memo } from "react";
import { useArchiveQueueProgress } from "@/store/archive-sender-queue";
import { ProgressPanel } from "@/components/ProgressPanel";
import { useAccount } from "@/providers/EmailAccountProvider";

export const ArchiveProgress = memo(() => {
  const { emailAccountId } = useAccount();
  const bulkArchiveProgress = useArchiveQueueProgress(emailAccountId);
  const totalItems = bulkArchiveProgress?.totalItems ?? 0;
  const completedItems = bulkArchiveProgress?.completedItems ?? 0;
  const failedItems = bulkArchiveProgress?.failedItems ?? 0;
  const activeItems = bulkArchiveProgress?.activeItems ?? 0;

  if (!totalItems) return null;

  return (
    <ProgressPanel
      totalItems={totalItems}
      remainingItems={activeItems}
      inProgressText={`Archiving senders...${failedItems ? ` ${failedItems} failed.` : ""}`}
      completedText={
        failedItems
          ? `Archiving finished: ${completedItems} succeeded, ${failedItems} failed.`
          : "Archiving complete!"
      }
      itemLabel="senders"
    />
  );
});
