"use client";

import { useMemo } from "react";
import type { DateRange } from "react-day-picker";
import { Clock, TrendingDown, TrendingUp, Timer } from "lucide-react";
import { useOrgSWR } from "@/hooks/useOrgSWR";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CardBasic } from "@/components/ui/card";
import { getDateRangeParams } from "./params";
import { BarChart } from "./BarChart";
import type { ChartConfig } from "@/components/ui/chart";
import { COLORS } from "@/utils/colors";
import { cn } from "@/utils";
import type {
  GetResponseTimeResponse,
  ResponseTimeParams,
} from "@/app/api/user/stats/response-time/route";
import { isDefined } from "@/utils/types";

interface ResponseTimeAnalyticsProps {
  dateRange?: DateRange;
  refreshInterval: number;
}

export function ResponseTimeAnalytics({
  dateRange,
  refreshInterval,
}: ResponseTimeAnalyticsProps) {
  const params: ResponseTimeParams = getDateRangeParams(dateRange);

  const { data, isLoading, error } = useOrgSWR<GetResponseTimeResponse>(
    `/api/user/stats/response-time?${new URLSearchParams(params as Record<string, string>)}`,
    { refreshInterval },
  );

  const distributionData = useMemo(() => {
    if (!data?.distribution) return [];
    return [
      { group: "< 1 hour", count: data.distribution.lessThan1Hour },
      { group: "1-4 hours", count: data.distribution.oneToFourHours },
      { group: "4-24 hours", count: data.distribution.fourTo24Hours },
      { group: "1-3 days", count: data.distribution.oneToThreeDays },
      { group: "3-7 days", count: data.distribution.threeToSevenDays },
      { group: "> 7 days", count: data.distribution.moreThan7Days },
    ];
  }, [data]);
  const trendData = useMemo(() => {
    if (!data?.trend) return [];
    return data.trend
      .map((item) =>
        item
          ? {
              date: item.period,
              median: item.medianResponseTime,
            }
          : null,
      )
      .filter(isDefined);
  }, [data]);

  const distributionChartConfig: ChartConfig = {
    count: { label: "Emails", color: COLORS.analytics.blue },
  };

  const trendChartConfig: ChartConfig = {
    median: { label: "Median Response Time", color: COLORS.analytics.purple },
  };

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="h-[400px] rounded" />}
    >
      {data && (
        <div className="space-y-4">
          {data.emailsAnalyzed > 0 && (
            <p className="text-muted-foreground text-sm">
              Respone time data based on last {data.emailsAnalyzed} email
              {data.emailsAnalyzed !== 1 ? "s" : ""}
            </p>
          )}

          <div className="grid gap-2 sm:gap-4 grid-cols-3">
            <SummaryCard
              title="Median Response"
              value={formatTime(data.summary.medianResponseTime)}
              icon={<Clock className="h-4 w-4" />}
              comparison={data.summary.previousPeriodComparison}
            />
            <SummaryCard
              title="Average Response"
              value={formatTime(data.summary.averageResponseTime)}
              icon={<Timer className="h-4 w-4" />}
            />
            <SummaryCard
              title="Within 1 Hour"
              value={`${data.summary.within1Hour}%`}
              icon={<TrendingUp className="h-4 w-4" />}
            />
          </div>

          {/* Distribution Chart */}
          {distributionData.some((d) => d.count > 0) && (
            <CardBasic>
              <p>Response Time Distribution</p>
              <div className="mt-4">
                <BarChart
                  data={distributionData}
                  config={distributionChartConfig}
                  dataKeys={["count"]}
                  xAxisKey="group"
                  xAxisFormatter={(value) => value}
                  tooltipLabelFormatter={(value) => String(value)}
                />
              </div>
            </CardBasic>
          )}

          {/* Trend Chart */}
          {trendData.length > 0 && (
            <CardBasic>
              <p>Weekly Response Time Trend</p>
              <div className="mt-4">
                <BarChart
                  data={trendData}
                  config={trendChartConfig}
                  dataKeys={["median"]}
                  xAxisKey="date"
                  xAxisFormatter={(value) => value}
                  yAxisFormatter={formatTimeShort}
                  tooltipValueFormatter={formatTime}
                />
              </div>
            </CardBasic>
          )}

          {/* Empty state */}
          {!distributionData.some((d) => d.count > 0) &&
            trendData.length === 0 && (
              <CardBasic>
                <p>Response Time Analytics</p>
                <div className="mt-4 h-32 flex items-center justify-center text-muted-foreground">
                  <p>No response time data available for this period.</p>
                </div>
              </CardBasic>
            )}
        </div>
      )}
    </LoadingContent>
  );
}

function SummaryCard({
  title,
  value,
  icon,
  comparison,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
  comparison?: {
    medianResponseTime: number;
    percentChange: number;
  } | null;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {title}
        </CardTitle>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {comparison && (
          <p
            className={cn(
              "text-xs mt-1 flex items-center gap-1",
              comparison.percentChange < 0
                ? "text-green-600"
                : comparison.percentChange > 0
                  ? "text-red-600"
                  : "text-muted-foreground",
            )}
          >
            {comparison.percentChange < 0 ? (
              <TrendingDown className="h-3 w-3" />
            ) : comparison.percentChange > 0 ? (
              <TrendingUp className="h-3 w-3" />
            ) : null}
            {comparison.percentChange === 0
              ? "No change"
              : `${Math.abs(comparison.percentChange)}% ${comparison.percentChange < 0 ? "faster" : "slower"}`}
            <span className="text-muted-foreground ml-1">vs previous</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function formatTime(minutes: number): string {
  if (minutes === 0) return "0m";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1440) {
    const hours = Math.floor(minutes / 60);
    const mins = Math.round(minutes % 60);
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
  }
  const days = Math.floor(minutes / 1440);
  const hours = Math.round((minutes % 1440) / 60);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

// Shorter format for Y-axis labels
function formatTimeShort(minutes: number): string {
  if (minutes === 0) return "0";
  if (minutes < 60) return `${Math.round(minutes)}m`;
  if (minutes < 1440) {
    const hours = Math.round(minutes / 60);
    return `${hours}h`;
  }
  const days = Math.round(minutes / 1440);
  return `${days}d`;
}
