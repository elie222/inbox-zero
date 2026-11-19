"use client";

import { useEffect } from "react";
import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { ProgressPanel } from "@/components/ProgressPanel";
import { useArchiveQueueProgress } from "@/store/archive-sender-queue";
import { useAccount } from "@/providers/EmailAccountProvider";

export function BulkArchiveProgress({
  onComplete,
}: {
  onComplete?: () => void;
}) {
  const { t } = useLingui();
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

  function getInProgressText() {
    const current = Math.min(settledItems + 1, totalItems);
    if (failedItems) {
      return t`${plural(totalItems, {
        one: `Archiving ${current} of # sender... ${failedItems} failed.`,
        other: `Archiving ${current} of # senders... ${failedItems} failed.`,
      })}`;
    }
    return t`${plural(totalItems, {
      one: `Archiving ${current} of # sender...`,
      other: `Archiving ${current} of # senders...`,
    })}`;
  }

  return (
    <ProgressPanel
      totalItems={totalItems}
      remainingItems={activeItems}
      inProgressText={getInProgressText()}
      completedText={
        failedItems
          ? t`Archiving finished: ${completedItems} succeeded, ${failedItems} failed.`
          : t`${plural(completedItems, {
              one: "Archiving complete! # sender processed!",
              other: "Archiving complete! # senders processed!",
            })}`
      }
      itemLabel={t`senders`}
    />
  );
}
