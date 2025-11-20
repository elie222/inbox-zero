"use client";

import { Card, Title } from "@tremor/react";
import { useMemo } from "react";
import type { DateRange } from "react-day-picker";
import { LabelList, Pie, PieChart } from "recharts";
import { fromPairs } from "lodash";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card as ShadcnCard,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getDateRangeParams } from "./params";
import { useOrgSWR } from "@/hooks/useOrgSWR";
import type { RuleStatsResponse } from "@/app/api/user/stats/rule-stats/route";
import { MOCK_RULE_STATS } from "@/app/(app)/[emailAccountId]/stats/mock-data";
import { NewBarChart } from "./NewBarChart";

interface RuleStatsChartProps {
  dateRange?: DateRange;
  title: string;
}

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function RuleStatsChart({ dateRange, title }: RuleStatsChartProps) {
  const params = getDateRangeParams(dateRange);

  const { /*data,*/ isLoading, error } = useOrgSWR<RuleStatsResponse>(
    `/api/user/stats/rule-stats?${new URLSearchParams(params as Record<string, string>)}`,
  );
  const data = MOCK_RULE_STATS;

  const barChartData = useMemo(() => {
    if (!data?.ruleStats) return [];
    return data.ruleStats.map((rule) => ({
      group: rule.ruleName,
      executed: rule.executedCount,
    }));
  }, [data]);

  const { pieChartData, chartConfig, barChartConfig } = useMemo(() => {
    if (!data?.ruleStats)
      return { pieChartData: [], chartConfig: {}, barChartConfig: {} };

    const pieData = data.ruleStats.map((rule, index) => ({
      name: rule.ruleName,
      value: rule.executedCount,
      fill: CHART_COLORS[index % CHART_COLORS.length],
    }));

    const config: ChartConfig = {
      value: {
        label: "Executed Rules",
      },
      ...fromPairs(
        data.ruleStats.map((rule, index) => [
          rule.ruleName,
          {
            label: rule.ruleName,
            color: CHART_COLORS[index % CHART_COLORS.length],
          },
        ]),
      ),
    };

    const barConfig: ChartConfig = {
      executed: {
        label: "Executed Rules",
        color: "#006EFF",
      },
    };

    return {
      pieChartData: pieData,
      chartConfig: config,
      barChartConfig: barConfig,
    };
  }, [data]);

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="h-64 w-full rounded" />}
    >
      {data && barChartData.length > 0 && (
        <Tabs defaultValue="bar">
          <Card>
            <div className="flex items-center justify-between">
              <Title>{title}</Title>
              <TabsList>
                <TabsTrigger value="bar">Bar Chart</TabsTrigger>
                <TabsTrigger value="pie">Pie Chart</TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="bar" className="mt-4">
              <NewBarChart
                data={barChartData}
                config={barChartConfig}
                dataKeys={["executed"]}
                xAxisKey="group"
                xAxisFormatter={(value) => value}
              />
            </TabsContent>

            <TabsContent value="pie">
              <ShadcnCard className="border-0 shadow-none">
                <CardHeader className="items-center pb-0">
                  <CardTitle className="text-base font-normal text-muted-foreground">
                    Rule Execution Distribution
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex-1 pb-0">
                  <ChartContainer
                    config={chartConfig}
                    className="mx-auto aspect-square max-h-[300px] [&_.recharts-text]:fill-background"
                  >
                    <PieChart>
                      <ChartTooltip
                        content={
                          <ChartTooltipContent nameKey="value" hideLabel />
                        }
                      />
                      <Pie data={pieChartData} dataKey="value">
                        <LabelList
                          dataKey="name"
                          className="fill-background"
                          stroke="none"
                          fontSize={12}
                        />
                      </Pie>
                    </PieChart>
                  </ChartContainer>
                </CardContent>
              </ShadcnCard>
            </TabsContent>
          </Card>
        </Tabs>
      )}
      {data && barChartData.length === 0 && (
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
