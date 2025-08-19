"use client";

import useSWR from "swr";
import { BarChart, Title } from "@tremor/react";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import type { StatsByWeekResponse } from "@/app/api/user/stats/by-period/route";
import { CardBasic } from "@/components/ui/card";

export function EmailActionsAnalytics() {
  const { data, isLoading, error } = useSWR<
    StatsByWeekResponse,
    { error: string }
  >("/api/user/stats/email-actions");

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
