"use client";

import * as React from "react";
import { parse } from "date-fns";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import type { StatsByWeekResponse } from "@/app/api/user/stats/by-period/route";

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

export function ChartLineNew(props: { data: StatsByWeekResponse }) {
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
      <div className="flex flex-col items-stretch border-b !p-0 sm:flex-row">
        <div className="flex w-full flex-col justify-center gap-1 px-6 sm:w-1/2 sm:pb-0">
          <CardTitle>Email Activity</CardTitle>
          <CardDescription>Showing email metrics over time</CardDescription>
        </div>
        <div className="flex w-full sm:w-1/2">
          {(["received", "sent", "read", "archived"] as const).map((key) => {
            const chart = key as keyof typeof chartConfig;
            const isActive = activeChart === chart;
            return (
              <button
                type="button"
                key={chart}
                data-active={isActive}
                className="data-[active=true]:bg-muted/50 flex flex-1 min-w-0 flex-col justify-center gap-1 border-t px-6 py-4 text-left [&:not(:first-child)]:border-l sm:border-t-0 sm:border-l sm:px-8 sm:py-6"
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
        <ChartContainer
          config={chartConfig}
          className="aspect-auto h-[250px] w-full"
        >
          <BarChart
            accessibilityLayer
            data={chartData}
            margin={{
              left: 12,
              right: 12,
            }}
          >
            <defs>
              <linearGradient id="receivedGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={chartConfig.received.color}
                  stopOpacity={0.8}
                />
                <stop
                  offset="100%"
                  stopColor={chartConfig.received.color}
                  stopOpacity={0.3}
                />
              </linearGradient>
              <linearGradient id="readGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={chartConfig.read.color}
                  stopOpacity={0.8}
                />
                <stop
                  offset="100%"
                  stopColor={chartConfig.read.color}
                  stopOpacity={0.3}
                />
              </linearGradient>
              <linearGradient id="sentGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={chartConfig.sent.color}
                  stopOpacity={0.8}
                />
                <stop
                  offset="100%"
                  stopColor={chartConfig.sent.color}
                  stopOpacity={0.3}
                />
              </linearGradient>
              <linearGradient id="archivedGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={chartConfig.archived.color}
                  stopOpacity={0.8}
                />
                <stop
                  offset="100%"
                  stopColor={chartConfig.archived.color}
                  stopOpacity={0.3}
                />
              </linearGradient>
              <linearGradient id="unreadGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={chartConfig.unread.color}
                  stopOpacity={0.8}
                />
                <stop
                  offset="100%"
                  stopColor={chartConfig.unread.color}
                  stopOpacity={0.3}
                />
              </linearGradient>
              <linearGradient id="inboxGradient" x1="0" y1="0" x2="0" y2="1">
                <stop
                  offset="0%"
                  stopColor={chartConfig.inbox.color}
                  stopOpacity={0.8}
                />
                <stop
                  offset="100%"
                  stopColor={chartConfig.inbox.color}
                  stopOpacity={0.3}
                />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={32}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                });
              }}
            />
            <YAxis tickLine={false} axisLine={false} tickMargin={8} />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  className="w-[150px]"
                  labelFormatter={(value) => {
                    return new Date(value).toLocaleDateString("en-US", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    });
                  }}
                />
              }
            />
            <Bar
              dataKey="received"
              fill="url(#receivedGradient)"
              radius={[4, 4, 0, 0]}
              animationDuration={750}
              animationBegin={0}
              hide={activeChart !== "received"}
            />
            <Bar
              dataKey="sent"
              fill="url(#sentGradient)"
              radius={[4, 4, 0, 0]}
              animationDuration={750}
              animationBegin={0}
              hide={activeChart !== "sent"}
            />
            <Bar
              dataKey="read"
              fill="url(#readGradient)"
              radius={[4, 4, 0, 0]}
              animationDuration={750}
              animationBegin={0}
              hide={activeChart !== "read"}
            />
            <Bar
              dataKey="unread"
              fill="url(#unreadGradient)"
              radius={[4, 4, 0, 0]}
              animationDuration={750}
              animationBegin={0}
              hide={activeChart !== "read"}
            />
            <Bar
              dataKey="archived"
              fill="url(#archivedGradient)"
              radius={[4, 4, 0, 0]}
              animationDuration={750}
              animationBegin={0}
              hide={activeChart !== "archived"}
            />
            <Bar
              dataKey="inbox"
              fill="url(#inboxGradient)"
              radius={[4, 4, 0, 0]}
              animationDuration={750}
              animationBegin={0}
              hide={activeChart !== "archived"}
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
