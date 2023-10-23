import { useMemo, useState } from "react";
import useSWR from "swr";
import { DateRange } from "react-day-picker";
import { subDays } from "date-fns";
import { DatePickerWithRange } from "@/components/DatePickerWithRange";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/Card";
import { AreaChart, Title } from "@tremor/react";
import {
  StatsByWeekResponse,
  StatsByWeekParams,
} from "@/app/api/user/stats/tinybird/route";
import { DetailedStatsFilter } from "@/app/(app)/stats/DetailedStatsFilter";
import { FilterIcon, GanttChartIcon } from "lucide-react";

const selectOptions = [
  { label: "Last week", value: "7" },
  { label: "Last month", value: "30" },
  { label: "Last 3 months", value: "90" },
  { label: "Last year", value: "365" },
  { label: "All", value: "0" },
  { label: "Custom", value: "custom" },
];

export function DetailedStats() {
  const [visibleBars, setVisibleBars] = useState<
    Record<
      "all" | "read" | "unread" | "sent" | "archived" | "unarchived",
      boolean
    >
  >({
    all: true,
    read: true,
    unread: true,
    sent: true,
    archived: true,
    unarchived: true,
  });
  const [period, setPeriod] = useState<"day" | "week" | "month" | "year">(
    "week"
  );

  const now = useMemo(() => new Date(), []);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(now, 365),
    to: now,
  });

  const params: StatsByWeekParams = {
    period,
    fromDate: dateRange?.from ? +dateRange?.from : undefined,
    toDate: dateRange?.to ? +dateRange?.to : undefined,
  };
  const { data, isLoading, error } = useSWR<
    StatsByWeekResponse,
    { error: string }
  >(`/api/user/stats/tinybird?${new URLSearchParams(params as any)}`);

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="h-64 w-full rounded" />}
    >
      {data && (
        <div>
          <div className="mt-2">
            <Card>
              <div className="flex items-center justify-between">
                <Title>Detailed Analytics</Title>
                <div className="flex space-x-2">
                  <DetailedStatsFilter
                    label="Period"
                    icon={<GanttChartIcon className="mr-2 h-4 w-4" />}
                    columns={[
                      {
                        label: "Day",
                        checked: period === "day",
                        setChecked: () => setPeriod("day"),
                      },
                      {
                        label: "Week",
                        checked: period === "week",
                        setChecked: () => setPeriod("week"),
                      },
                      {
                        label: "Month",
                        checked: period === "month",
                        setChecked: () => setPeriod("month"),
                      },
                      {
                        label: "Year",
                        checked: period === "year",
                        setChecked: () => setPeriod("year"),
                      },
                    ]}
                  />
                  <DetailedStatsFilter
                    label="Filter"
                    icon={<FilterIcon className="mr-2 h-4 w-4" />}
                    columns={[
                      {
                        label: "All",
                        checked: visibleBars.all,
                        setChecked: () =>
                          setVisibleBars({
                            ...visibleBars,
                            ["all"]: !visibleBars.all,
                          }),
                      },
                      {
                        label: "Read",
                        checked: visibleBars.read,
                        setChecked: () =>
                          setVisibleBars({
                            ...visibleBars,
                            ["read"]: !visibleBars.read,
                          }),
                      },
                      {
                        label: "Unread",
                        checked: visibleBars.unread,
                        setChecked: () =>
                          setVisibleBars({
                            ...visibleBars,
                            ["unread"]: !visibleBars.unread,
                          }),
                      },
                      {
                        label: "Unarchived",
                        checked: visibleBars.unarchived,
                        setChecked: () =>
                          setVisibleBars({
                            ...visibleBars,
                            ["unarchived"]: !visibleBars.unarchived,
                          }),
                      },
                      {
                        label: "Archived",
                        checked: visibleBars.archived,
                        setChecked: () =>
                          setVisibleBars({
                            ...visibleBars,
                            ["archived"]: !visibleBars.archived,
                          }),
                      },
                      {
                        label: "Sent",
                        checked: visibleBars.sent,
                        setChecked: () =>
                          setVisibleBars({
                            ...visibleBars,
                            ["sent"]: !visibleBars.sent,
                          }),
                      },
                    ]}
                  />
                  <DatePickerWithRange
                    selectOptions={selectOptions}
                    onSetSelectValue={(value) => {
                      const days = parseInt(value);

                      if (days === 0) setDateRange(undefined);
                      if (days)
                        setDateRange({ from: subDays(now, days), to: now });
                    }}
                    dateRange={dateRange}
                    onSetDateRange={setDateRange}
                  />
                </div>
              </div>

              <AreaChart
                className="mt-4 h-72"
                data={data.result}
                index="startOfPeriod"
                categories={[
                  visibleBars.all ? "All" : "",
                  visibleBars.read ? "Read" : "",
                  visibleBars.unread ? "Unread" : "",
                  visibleBars.unarchived ? "Unarchived" : "",
                  visibleBars.archived ? "Archived" : "",
                ]}
                colors={["blue", "amber", "cyan", "emerald", "lime"]}
              />
              <AreaChart
                className="mt-4 h-72"
                data={data.result}
                index="startOfPeriod"
                categories={[visibleBars.sent ? "Sent" : ""]}
                colors={["orange"]}
              />
            </Card>
          </div>
        </div>
      )}
    </LoadingContent>
  );
}
