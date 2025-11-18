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
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const data = payload[0];
                return (
                  <div className="rounded-lg border border-border/50 bg-background px-3 py-2 text-xs shadow-xl">
                    <p className="mb-2 font-medium">
                      {new Date(data.payload.date).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                    {payload.map((entry) => (
                      <div
                        key={entry.dataKey}
                        className="flex items-center gap-2 py-0.5"
                      >
                        <span
                          className="h-2.5 w-2.5 rounded-full"
                          style={{
                            backgroundColor:
                              chartConfig[
                                entry.dataKey as keyof typeof chartConfig
                              ]?.color,
                          }}
                        />
                        <span className="text-muted-foreground">
                          {
                            chartConfig[
                              entry.dataKey as keyof typeof chartConfig
                            ]?.label
                          }
                          :
                        </span>
                        <span className="ml-auto font-medium">
                          {entry.value}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            <Bar
              dataKey="received"
              fill="url(#receivedGradient)"
              color={chartConfig.received.color}
              radius={[4, 4, 0, 0]}
              animationDuration={750}
              animationBegin={0}
              hide={activeChart !== "received"}
            />
            <Bar
              dataKey="sent"
              fill="url(#sentGradient)"
              color={chartConfig.sent.color}
              radius={[4, 4, 0, 0]}
              animationDuration={750}
              animationBegin={0}
              hide={activeChart !== "sent"}
            />
            <Bar
              dataKey="read"
              fill="url(#readGradient)"
              color={chartConfig.read.color}
              radius={[4, 4, 0, 0]}
              animationDuration={750}
              animationBegin={0}
              hide={activeChart !== "read"}
            />
            <Bar
              dataKey="unread"
              fill="url(#unreadGradient)"
              color={chartConfig.unread.color}
              radius={[4, 4, 0, 0]}
              animationDuration={750}
              animationBegin={0}
              hide={activeChart !== "read"}
            />
            <Bar
              dataKey="archived"
              fill="url(#archivedGradient)"
              color={chartConfig.archived.color}
              radius={[4, 4, 0, 0]}
              animationDuration={750}
              animationBegin={0}
              hide={activeChart !== "archived"}
            />
            <Bar
              dataKey="inbox"
              fill="url(#inboxGradient)"
              color={chartConfig.inbox.color}
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
