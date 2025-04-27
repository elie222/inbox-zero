"use client";

import { useState } from "react";
import useSWR from "swr";
import { BarChart } from "@tremor/react";
import { FilterIcon } from "lucide-react";
import type { DateRange } from "react-day-picker";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type {
  StatsByWeekResponse,
  StatsByWeekParams,
} from "@/app/api/user/stats/by-period/route";
import { DetailedStatsFilter } from "@/app/(app)/[emailAccountId]/stats/DetailedStatsFilter";
import { getDateRangeParams } from "@/app/(app)/[emailAccountId]/stats/params";

export function DetailedStats(props: {
  dateRange?: DateRange | undefined;
  period: "day" | "week" | "month" | "year";
  refreshInterval: number;
}) {
  const { dateRange, period } = props;

  const [visibleBars, setVisibleBars] = useState<
    Record<
      "all" | "read" | "unread" | "sent" | "archived" | "unarchived",
      boolean
    >
  >({
    all: false,
    read: false,
    unread: false,
    sent: false,
    archived: true,
    unarchived: true,
  });

  const params: StatsByWeekParams = {
    period,
    ...getDateRangeParams(dateRange),
  };

  const { data, isLoading, error } = useSWR<
    StatsByWeekResponse,
    { error: string }
  >(`/api/user/stats/by-period?${new URLSearchParams(params as any)}`, {
    refreshInterval: props.refreshInterval,
  });

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="h-64 w-full rounded" />}
    >
      {data && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Detailed Analytics</CardTitle>
              <DetailedStatsFilter
                label="Types"
                icon={<FilterIcon className="mr-2 h-4 w-4" />}
                columns={[
                  {
                    label: "All",
                    checked: visibleBars.all,
                    setChecked: () =>
                      setVisibleBars({
                        ...visibleBars,
                        all: !visibleBars.all,
                      }),
                  },
                  {
                    label: "Read",
                    checked: visibleBars.read,
                    setChecked: () =>
                      setVisibleBars({
                        ...visibleBars,
                        read: !visibleBars.read,
                      }),
                  },
                  {
                    label: "Unread",
                    checked: visibleBars.unread,
                    setChecked: () =>
                      setVisibleBars({
                        ...visibleBars,
                        unread: !visibleBars.unread,
                      }),
                  },
                  {
                    label: "Unarchived",
                    checked: visibleBars.unarchived,
                    setChecked: () =>
                      setVisibleBars({
                        ...visibleBars,
                        unarchived: !visibleBars.unarchived,
                      }),
                  },
                  {
                    label: "Archived",
                    checked: visibleBars.archived,
                    setChecked: () =>
                      setVisibleBars({
                        ...visibleBars,
                        archived: !visibleBars.archived,
                      }),
                  },
                  {
                    label: "Sent",
                    checked: visibleBars.sent,
                    setChecked: () =>
                      setVisibleBars({
                        ...visibleBars,
                        sent: !visibleBars.sent,
                      }),
                  },
                ]}
              />
            </div>
          </CardHeader>
          <CardContent>
            <BarChart
              className="mt-4 h-72"
              data={data.result}
              index="startOfPeriod"
              categories={[
                ...(visibleBars.all ? ["All"] : []),
                ...(visibleBars.archived ? ["Archived"] : []),
                ...(visibleBars.unarchived ? ["Unarchived"] : []),
                ...(visibleBars.read ? ["Read"] : []),
                ...(visibleBars.unread ? ["Unread"] : []),
                ...(visibleBars.sent ? ["Sent"] : []),
              ]}
              colors={[
                ...(visibleBars.all ? (["fuchsia"] as const) : []),
                ...(visibleBars.archived ? (["emerald"] as const) : []),
                ...(visibleBars.unarchived ? (["amber"] as const) : []),
                ...(visibleBars.read ? (["lime"] as const) : []),
                ...(visibleBars.unread ? (["pink"] as const) : []),
                ...(visibleBars.sent ? (["blue"] as const) : []),
              ]}
            />
            <BarChart
              className="mt-4 h-72"
              data={data.result}
              index="startOfPeriod"
              categories={["Read", "Unread"]}
              colors={["lime", "pink"]}
            />
            <BarChart
              className="mt-4 h-72"
              data={data.result}
              index="startOfPeriod"
              categories={["Sent"]}
              colors={["blue"]}
            />
          </CardContent>
        </Card>
      )}
    </LoadingContent>
  );
}
