"use client";

import { useCallback, useMemo, useState } from "react";
import { subDays } from "date-fns/subDays";
import {
  ActivityIcon,
  MailIcon,
  PlugZapIcon,
  SparklesIcon,
  TriangleAlertIcon,
  UserPlusIcon,
  UsersRoundIcon,
} from "lucide-react";
import type { DateRange } from "react-day-picker";
import { BarChart } from "@/components/charts/BarChart";
import { DatePickerWithRange } from "@/components/DatePickerWithRange";
import { LoadingContent } from "@/components/LoadingContent";
import { StatsCards } from "@/components/StatsCards";
import { MutedText } from "@/components/Typography";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  useAdminOverview,
  useAdminSignups,
  useAdminThroughput,
} from "@/hooks/useAdminStats";

const selectOptions = [
  { label: "Last week", value: "7" },
  { label: "Last month", value: "30" },
  { label: "Last 3 months", value: "90" },
  { label: "All time", value: "0" },
];
const defaultSelected = selectOptions[1];

const signupsChartConfig = {
  Users: { label: "Users", color: "var(--chart-1)" },
  Mailboxes: { label: "Mailboxes", color: "var(--chart-2)" },
};

export function AdminOverview() {
  const [dateDropdown, setDateDropdown] = useState<string>(
    defaultSelected.label,
  );

  const now = useMemo(() => new Date(), []);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(now, Number.parseInt(defaultSelected.value)),
    to: now,
  });

  const onSetDateDropdown = useCallback(
    (option: { label: string; value: string }) => setDateDropdown(option.label),
    [],
  );

  const range = useMemo(
    () => ({
      fromDate: dateRange?.from?.getTime(),
      toDate: dateRange?.to?.getTime(),
    }),
    [dateRange],
  );

  const {
    data: overview,
    isLoading: overviewLoading,
    error: overviewError,
  } = useAdminOverview(range);
  const {
    data: signups,
    isLoading: signupsLoading,
    error: signupsError,
  } = useAdminSignups(range);
  const {
    data: throughput,
    isLoading: throughputLoading,
    error: throughputError,
  } = useAdminThroughput();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <MutedText>Everything below covers the selected window.</MutedText>
        <DatePickerWithRange
          dateRange={dateRange}
          onSetDateRange={setDateRange}
          selectOptions={selectOptions}
          dateDropdown={dateDropdown}
          onSetDateDropdown={onSetDateDropdown}
        />
      </div>

      <LoadingContent
        loading={overviewLoading}
        error={overviewError}
        loadingComponent={<Skeleton className="h-24" />}
      >
        {overview && (
          <div className="space-y-4">
            <StatsCards
              stats={[
                {
                  name: "Users",
                  value: overview.totalUsers.toLocaleString(),
                  subvalue: `+${overview.newUsers.toLocaleString()} in window`,
                  icon: <UsersRoundIcon className="h-4 w-4" />,
                },
                {
                  name: "Mailboxes",
                  value: overview.totalMailboxes.toLocaleString(),
                  subvalue: `+${overview.newMailboxes.toLocaleString()} in window`,
                  icon: <MailIcon className="h-4 w-4" />,
                },
                {
                  name: "Onboarded",
                  value: overview.onboardedUsers.toLocaleString(),
                  subvalue: formatPercent(
                    overview.onboardedUsers,
                    overview.totalUsers,
                  ),
                  icon: <UserPlusIcon className="h-4 w-4" />,
                },
              ]}
            />

            <StatsCards
              stats={[
                {
                  name: "Receiving mail",
                  value: overview.healthyWatches.toLocaleString(),
                  subvalue: "mailboxes with a live watch",
                  icon: <ActivityIcon className="h-4 w-4" />,
                },
                {
                  name: "Disconnected",
                  value: overview.disconnectedAccounts.toLocaleString(),
                  subvalue: "accounts needing reconnect",
                  icon: <PlugZapIcon className="h-4 w-4" />,
                },
                {
                  name: "In error state",
                  value: overview.usersInErrorState.toLocaleString(),
                  subvalue: "users with an unresolved error",
                  icon: <TriangleAlertIcon className="h-4 w-4" />,
                },
              ]}
            />
          </div>
        )}
      </LoadingContent>

      <Card>
        <CardHeader>
          <CardTitle>Signups</CardTitle>
        </CardHeader>
        <CardContent>
          <LoadingContent
            loading={signupsLoading}
            error={signupsError}
            loadingComponent={<Skeleton className="h-64" />}
          >
            {signups &&
              (signups.result.length > 0 ? (
                <BarChart
                  data={signups.result}
                  config={signupsChartConfig}
                  dataKeys={["Users", "Mailboxes"]}
                  xAxisFormatter={(value) => value}
                />
              ) : (
                <MutedText>No signups in this window.</MutedText>
              ))}
          </LoadingContent>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <SparklesIcon className="size-4" />
            AI spend (last 7 days)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <LoadingContent
            loading={throughputLoading}
            error={throughputError}
            loadingComponent={<Skeleton className="h-24" />}
          >
            {throughput &&
              (throughput.modelSpend.length > 0 ? (
                <div className="space-y-4">
                  <StatsCards
                    stats={[
                      {
                        name: throughput.truncated
                          ? `Spend (top ${throughput.modelLimit} models)`
                          : "Spend",
                        value: formatCurrency(throughput.totalCost),
                        icon: <SparklesIcon className="h-4 w-4" />,
                      },
                      {
                        name: throughput.truncated
                          ? `Calls (top ${throughput.modelLimit} models)`
                          : "Calls",
                        value: throughput.totalCalls.toLocaleString(),
                        icon: <ActivityIcon className="h-4 w-4" />,
                      },
                    ]}
                  />
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Model</TableHead>
                        <TableHead className="text-right">Calls</TableHead>
                        <TableHead className="text-right">Cost</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {throughput.modelSpend.map((row) => (
                        <TableRow key={`${row.provider}:${row.model}`}>
                          <TableCell>
                            {row.provider}/{row.model}
                          </TableCell>
                          <TableCell className="text-right">
                            {row.calls.toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            {formatCurrency(row.cost)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <MutedText>
                  No AI usage recorded. This is empty when Tinybird analytics
                  are not configured.
                </MutedText>
              ))}
          </LoadingContent>
        </CardContent>
      </Card>
    </div>
  );
}

function formatPercent(value: number, total: number) {
  if (!total) return "0% of users";
  return `${Math.round((value / total) * 100)}% of users`;
}

function formatCurrency(value: number) {
  return `$${value.toFixed(2)}`;
}
