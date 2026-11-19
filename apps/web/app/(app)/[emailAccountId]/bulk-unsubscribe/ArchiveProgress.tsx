"use client";

import { plural } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { memo, useEffect } from "react";
import {
  clearArchiveSenderStatuses,
  useArchiveQueueProgress,
} from "@/store/archive-sender-queue";
import { ProgressPanel } from "@/components/ProgressPanel";
import { useAccount } from "@/providers/EmailAccountProvider";

// A named function rather than an inline arrow: the Lingui macro resolves a
// nested plural() inside memo(() => ...) to the global i18n instance.
export const ArchiveProgress = memo(ArchiveProgressPanel);

function ArchiveProgressPanel() {
  const { t } = useLingui();
  const { emailAccountId } = useAccount();
  const bulkArchiveProgress = useArchiveQueueProgress(emailAccountId);
  const totalItems = bulkArchiveProgress?.totalItems ?? 0;
  const completedItems = bulkArchiveProgress?.completedItems ?? 0;
  const failedItems = bulkArchiveProgress?.failedItems ?? 0;
  const activeItems = bulkArchiveProgress?.activeItems ?? 0;

  useEffect(() => {
    if (!totalItems || activeItems) return;
    const timeoutId = setTimeout(
      () => clearArchiveSenderStatuses(emailAccountId),
      3000,
    );
    return () => clearTimeout(timeoutId);
  }, [activeItems, emailAccountId, totalItems]);

  if (!totalItems) return null;

  const inProgressText = failedItems
    ? t`Archiving senders... ${plural(failedItems, {
        one: "# failed.",
        other: "# failed.",
      })}`
    : t`Archiving senders...`;
  const completedText = failedItems
    ? t`Archiving finished: ${plural(completedItems, {
        one: "# succeeded",
        other: "# succeeded",
      })}, ${plural(failedItems, {
        one: "# failed.",
        other: "# failed.",
      })}`
    : t`Archiving complete!`;

  return (
    <ProgressPanel
      totalItems={totalItems}
      remainingItems={activeItems}
      inProgressText={inProgressText}
      completedText={completedText}
      itemLabel={t`senders`}
    />
  );
}
