"use client";

import type { DateRange } from "react-day-picker";
import { useOrgSWR } from "@/hooks/useOrgSWR";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  StatsByWeekParams,
  StatsByWeekResponse,
} from "@/app/api/user/stats/by-period/route";
import { getDateRangeParams } from "./params";
import { MainStatChart } from "@/app/(app)/[emailAccountId]/stats/MainStatChart";

export function StatsSummary(props: {
  dateRange?: DateRange;
  refreshInterval: number;
  period: "day" | "week" | "month" | "year";
}) {
  const { dateRange, period } = props;

  const params: StatsByWeekParams = {
    period,
    ...getDateRangeParams(dateRange),
  };

  const { data, isLoading, error } = useOrgSWR<
    StatsByWeekResponse,
    { error: string }
  >(
    `/api/user/stats/by-period?${new URLSearchParams(
      Object.fromEntries(
        Object.entries(params).map(([k, v]) => [k, v?.toString() ?? ""]),
      ) as Record<string, string>,
    )}`,
    {
      refreshInterval: props.refreshInterval,
    },
  );

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="h-[405px] rounded" />}
    >
      {data && <MainStatChart data={data} period={period} />}
    </LoadingContent>
  );
}
