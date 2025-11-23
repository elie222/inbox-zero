"use client";

import { useOrgSWR } from "@/hooks/useOrgSWR";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { CardBasic } from "@/components/ui/card";
import type { EmailActionStatsResponse } from "@/app/api/user/stats/email-actions/route";
import { NewBarChart } from "./NewBarChart";
import type { ChartConfig } from "@/components/ui/chart";

const chartConfig = {
  Archived: {
    label: "Archived",
    color: "#17A34A",
  },
  Deleted: {
    label: "Deleted",
    color: "#C942B2",
  },
} satisfies ChartConfig;

export function EmailActionsAnalytics() {
  const { data, isLoading, error } = useOrgSWR<EmailActionStatsResponse>(
    "/api/user/stats/email-actions",
  );

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="h-32 w-full rounded" />}
    >
      {data && (
        <CardBasic>
          <p>How many emails you've archived and deleted with Inbox Zero</p>
          <div className="mt-4">
            <NewBarChart
              data={data.result}
              config={chartConfig}
              dataKeys={["Archived", "Deleted"]}
              xAxisKey="date"
            />
          </div>
        </CardBasic>
      )}
    </LoadingContent>
  );
}
