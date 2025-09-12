"use client";

import { BarChart, Card, Title } from "@tremor/react";
import { useMemo } from "react";
import type { DateRange } from "react-day-picker";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { getDateRangeParams } from "./params";
import { useOrgSWR } from "@/hooks/useOrgSWR";
import type { RuleStatsResponse } from "@/app/api/user/stats/rule-stats/route";

interface RuleStatsChartProps {
  dateRange?: DateRange;
  title: string;
}

export function RuleStatsChart({ dateRange, title }: RuleStatsChartProps) {
  const params = getDateRangeParams(dateRange);

  const { data, isLoading, error } = useOrgSWR<RuleStatsResponse>(
    `/api/user/stats/rule-stats?${new URLSearchParams(params as Record<string, string>)}`,
  );

  const chartData = useMemo(() => {
    if (!data?.groupStats) return [];
    return data.groupStats.map((group) => ({
      group: group.groupName,
      "Executed Rules": group.executedCount,
    }));
  }, [data]);

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="h-64 w-full rounded" />}
    >
      {data && chartData.length > 0 && (
        <Card>
          <Title>{title}</Title>
          <BarChart
            className="mt-4 h-72"
            data={chartData}
            index="group"
            categories={["Executed Rules"]}
            colors={["blue"]}
            showLegend={false}
            showGridLines={true}
          />
        </Card>
      )}
      {data && chartData.length === 0 && (
        <Card>
          <Title>{title}</Title>
          <div className="mt-4 h-72 flex items-center justify-center text-muted-foreground">
            <p>No executed rules found for this period.</p>
          </div>
        </Card>
      )}
    </LoadingContent>
  );
}
