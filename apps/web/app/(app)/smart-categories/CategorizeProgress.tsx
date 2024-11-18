"use client";

import useSWR from "swr";
import { ProgressPanel } from "@/components/ProgressPanel";
import type { CategorizeProgress } from "@/app/api/user/categorize/senders/progress/route";

export function CategorizeSendersProgress({
  refresh = false,
}: {
  refresh: boolean;
}) {
  const { data } = useSWR<CategorizeProgress>(
    "/api/user/categorize/senders/progress",
    {
      refreshInterval: refresh ? 1_000 : undefined,
    },
  );

  if (!data) return null;

  return (
    <ProgressPanel
      totalItems={data.totalPages}
      remainingItems={data.totalPages - data.pageIndex}
      inProgressText={`Categorizing senders... ${data.categorized} categorized`}
      completedText={`Categorization complete! ${data.categorized} categorized!`}
      itemLabel="pages"
    />
  );
}
