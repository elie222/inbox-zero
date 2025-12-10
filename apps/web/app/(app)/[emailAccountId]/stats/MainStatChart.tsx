"use client";

import * as React from "react";
import { parse, format } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import type { ChartConfig } from "@/components/ui/chart";
import type { StatsByPeriodResponse } from "@/app/api/user/stats/by-period/controller";
import { BarChart } from "@/app/(app)/[emailAccountId]/stats/BarChart";
import { COLORS } from "@/utils/colors";

const chartConfig = {
  received: { label: "Received", color: COLORS.analytics.blue },
  sent: { label: "Sent", color: COLORS.analytics.purple },
  read: { label: "Read", color: COLORS.analytics.pink },
  unread: { label: "Unread", color: COLORS.analytics.lightPink },
  archived: { label: "Archived", color: COLORS.analytics.green },
  inbox: { label: "Inbox", color: COLORS.analytics.lightGreen },
} satisfies ChartConfig;

function getActiveChart(activChart: keyof typeof chartConfig): string[] {
  if (activChart === "received") return ["received"];
  if (activChart === "sent") return ["sent"];
  if (activChart === "read") return ["read", "unread"];
  if (activChart === "archived") return ["archived", "inbox"];
  return [];
}

export function MainStatChart(props: {
  data: StatsByPeriodResponse;
  period: "day" | "week" | "month" | "year";
}) {
  const [activeChart, setActiveChart] =
    React.useState<keyof typeof chartConfig>("received");

  const chartData = React.useMemo(() => {
    return props.data.result.map((item) => {
      const date = parse(item.startOfPeriod, "MMM dd, yyyy", new Date());
      const dateStr = format(date, "yyyy-MM-dd");

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
    <Card className="py-0">
      <div className="grid grid-cols-2 border-b sm:flex sm:flex-row">
        {(["received", "sent", "read", "archived"] as const).map((key) => {
          const chart = key as keyof typeof chartConfig;
          const isActive = activeChart === chart;
          return (
            <button
              type="button"
              key={chart}
              data-active={isActive}
              className="data-[active=true]:bg-muted/50 flex flex-1 min-w-0 flex-col justify-center gap-1 px-6 py-4 text-left sm:px-8 sm:py-6 [&:nth-child(even)]:border-l [&:nth-child(n+3)]:border-t sm:[&:nth-child(n+3)]:border-t-0 sm:[&:nth-child(2)]:border-l sm:[&:nth-child(3)]:border-l sm:[&:nth-child(4)]:border-l"
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
      <CardContent className="p-6 pl-0 sm:px-2">
        <BarChart
          data={chartData}
          config={chartConfig}
          activeCharts={getActiveChart(activeChart)}
          period={props.period}
        />
      </CardContent>
    </Card>
  );
}
