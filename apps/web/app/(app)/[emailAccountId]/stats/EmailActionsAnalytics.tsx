"use client";

import { useOrgSWR } from "@/hooks/useOrgSWR";
import { BarChart, Title } from "@tremor/react";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { CardBasic } from "@/components/ui/card";
import type { EmailActionStatsResponse } from "@/app/api/user/stats/email-actions/route";
import { MOCK_EMAIL_ACTIONS } from "@/app/(app)/[emailAccountId]/stats/mock-data";

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
          <BarChart
            className="mt-4 h-72"
            data={data.result}
            index="date"
            categories={["Archived", "Deleted"]}
            colors={["lime", "pink"]}
          />
        </CardBasic>
      )}
    </LoadingContent>
  );
}
