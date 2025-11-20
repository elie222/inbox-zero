"use client";

import * as React from "react";
import { parse } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import type { ChartConfig } from "@/components/ui/chart";
import type { StatsByWeekResponse } from "@/app/api/user/stats/by-period/route";
import { NewBarChart } from "@/app/(app)/[emailAccountId]/stats/NewBarChart";

export const description =
  "An interactive multiple bar chart for email metrics";

const chartConfig = {
  received: {
    label: "Received",
    color: "#006EFF80",
  },
  sent: {
    label: "Sent",
    color: "#6410FF80",
  },
  read: {
    label: "Read",
    color: "#C942B2",
  },
  unread: {
    label: "Unread",
    color: "#C942B260",
  },
  archived: {
    label: "Archived",
    color: "#17A34A",
  },
  inbox: {
    label: "Inbox",
    color: "#17A34A60",
  },
} satisfies ChartConfig;

export function MainStatChart(props: { data: StatsByWeekResponse }) {
  const [activeChart, setActiveChart] =
    React.useState<keyof typeof chartConfig>("received");

  // Transform API data to chart format
  const chartData = React.useMemo(() => {
    return props.data.result.map((item) => {
      // Parse the date string (format: "LLL dd, y" like "Jan 01, 2024")
      // Use "MMM" for parsing (month abbreviation)
      const date = parse(item.startOfPeriod, "MMM dd, y", new Date());
      const dateStr = date.toISOString().split("T")[0];

      return {
        date: dateStr,
        received: item.All,
        read: item.Read,
        sent: item.Sent,
        archived: item.Archived,
        unread: item.Unread,
        inbox: item.Unarchived,
      };
    });
  }, [props.data]);

  const total = React.useMemo(
    () => ({
      received: props.data.allCount,
      read: props.data.readCount,
      sent: props.data.sentCount,
      archived: props.data.allCount - props.data.inboxCount,
      unread: props.data.allCount - props.data.readCount,
      inbox: props.data.inboxCount,
    }),
    [props.data],
  );

  return (
    <Card className="py-4 sm:py-0">
      <div className="flex flex-col items-stretch border-b sm:flex-row">
        <div className="flex w-full">
          {(["received", "sent", "read", "archived"] as const).map((key) => {
            const chart = key as keyof typeof chartConfig;
            const isActive = activeChart === chart;
            return (
              <button
                type="button"
                key={chart}
                data-active={isActive}
                className="data-[active=true]:bg-muted/50 flex flex-1 min-w-0 flex-col justify-center gap-1 border-t px-6 py-4 text-left [&:not(:first-child)]:border-l sm:border-t-0 sm:px-8 sm:py-6"
                onClick={() => setActiveChart(chart)}
              >
                <span className="text-muted-foreground text-xs flex items-center gap-1.5">
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ backgroundColor: chartConfig[chart].color }}
                  />
                  {chartConfig[chart].label}
                </span>
                <span className="text-lg leading-none font-bold sm:text-3xl">
                  {total[key].toLocaleString()}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      <CardContent className="px-2 sm:p-6">
        <NewBarChart
          data={chartData}
          config={chartConfig}
          activeCharts={
            activeChart === "received"
              ? ["received"]
              : activeChart === "sent"
                ? ["sent"]
                : activeChart === "read"
                  ? ["read", "unread"]
                  : activeChart === "archived"
                    ? ["archived", "inbox"]
                    : []
          }
        />
      </CardContent>
    </Card>
  );
}
