"use client";

import { useOrgSWR } from "@/hooks/useOrgSWR";
import { Title } from "@tremor/react";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { CardBasic } from "@/components/ui/card";
import type { EmailActionStatsResponse } from "@/app/api/user/stats/email-actions/route";
import { MOCK_EMAIL_ACTIONS } from "@/app/(app)/[emailAccountId]/stats/mock-data";
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
  const { /*data, */ isLoading, error } = useOrgSWR<EmailActionStatsResponse>(
    "/api/user/stats/email-actions",
  );
  const data = MOCK_EMAIL_ACTIONS;

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="h-32 w-full rounded" />}
    >
      {data && (
        <CardBasic>
          <Title>
            How many emails you've archived and deleted with Inbox Zero
          </Title>
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
