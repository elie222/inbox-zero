"use client";

import { useState, useMemo, useCallback } from "react";
import type { DateRange } from "react-day-picker";
import { subDays } from "date-fns/subDays";
import { Mail, Sparkles, Users } from "lucide-react";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DatePickerWithRange } from "@/components/DatePickerWithRange";
import { useOrgStatsTotals } from "@/hooks/useOrgStatsTotals";
import { useOrgStatsEmailBuckets } from "@/hooks/useOrgStatsEmailBuckets";
import { useOrgStatsRulesBuckets } from "@/hooks/useOrgStatsRulesBuckets";

const selectOptions = [
  { label: "Last week", value: "7" },
  { label: "Last month", value: "30" },
  { label: "Last 3 months", value: "90" },
  { label: "All time", value: "0" },
];
const defaultSelected = selectOptions[1];

export function OrgStats({ organizationId }: { organizationId: string }) {
  const [dateDropdown, setDateDropdown] = useState<string>(
    defaultSelected.label,
  );

  const now = useMemo(() => new Date(), []);
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(now, Number.parseInt(defaultSelected.value)),
    to: now,
  });

  const onSetDateDropdown = useCallback(
    (option: { label: string; value: string }) => {
      setDateDropdown(option.label);
    },
    [],
  );

  const options = useMemo(
    () => ({
      fromDate: dateRange?.from?.getTime(),
      toDate: dateRange?.to?.getTime(),
    }),
    [dateRange],
  );

  const {
    data: totalsData,
    isLoading: totalsLoading,
    error: totalsError,
  } = useOrgStatsTotals(organizationId, options);

  const {
    data: emailBucketsData,
    isLoading: emailBucketsLoading,
    error: emailBucketsError,
  } = useOrgStatsEmailBuckets(organizationId, options);

  const {
    data: rulesBucketsData,
    isLoading: rulesBucketsLoading,
    error: rulesBucketsError,
  } = useOrgStatsRulesBuckets(organizationId, options);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <DatePickerWithRange
          dateRange={dateRange}
          onSetDateRange={setDateRange}
          selectOptions={selectOptions}
          dateDropdown={dateDropdown}
          onSetDateDropdown={onSetDateDropdown}
        />
      </div>

      <div className="space-y-6">
        <LoadingContent
          loading={totalsLoading}
          error={totalsError}
          loadingComponent={
            <div className="grid gap-4 md:grid-cols-3">
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
              <Skeleton className="h-24" />
            </div>
          }
        >
          {totalsData && (
            <div className="grid gap-4 md:grid-cols-3">
              <StatCard
                title="Emails Received"
                value={totalsData.totalEmails.toLocaleString()}
                icon={<Mail className="h-4 w-4 text-muted-foreground" />}
              />
              <StatCard
                title="Rules Executed"
                value={totalsData.totalRules.toLocaleString()}
                icon={<Sparkles className="h-4 w-4 text-muted-foreground" />}
              />
              <StatCard
                title="Active Members"
                value={totalsData.activeMembers.toLocaleString()}
                icon={<Users className="h-4 w-4 text-muted-foreground" />}
              />
            </div>
          )}
        </LoadingContent>

        <div className="grid gap-4 md:grid-cols-2">
          <LoadingContent
            loading={emailBucketsLoading}
            error={emailBucketsError}
            loadingComponent={<Skeleton className="h-64" />}
          >
            {emailBucketsData && (
              <BucketChart
                title="Email Volume Distribution"
                description="Number of users by emails received in selected period"
                data={emailBucketsData}
                emptyMessage="No email data available. Users need to load their stats first."
                unit="emails"
              />
            )}
          </LoadingContent>

          <LoadingContent
            loading={rulesBucketsLoading}
            error={rulesBucketsError}
            loadingComponent={<Skeleton className="h-64" />}
          >
            {rulesBucketsData && (
              <BucketChart
                title="Automation Usage Distribution"
                description="Number of users by rules executed in selected period"
                data={rulesBucketsData}
                emptyMessage="No automation data yet."
                unit="rules"
              />
            )}
          </LoadingContent>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
}: {
  title: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {icon}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

function BucketChart({
  title,
  description,
  data,
  emptyMessage,
  unit = "emails",
}: {
  title: string;
  description: string;
  data: { label: string; userCount: number }[];
  emptyMessage: string;
  unit?: string;
}) {
  const hasData = data.some((bucket) => bucket.userCount > 0);
  const maxValue = Math.max(...data.map((d) => d.userCount), 1);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
        <p className="text-sm text-muted-foreground">{description}</p>
      </CardHeader>
      <CardContent>
        {!hasData ? (
          <div className="flex h-40 items-center justify-center">
            <p className="text-sm text-muted-foreground text-center">
              {emptyMessage}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.map((bucket) => (
              <div key={bucket.label} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">
                    {bucket.label} {unit}
                  </span>
                  <span className="font-medium">
                    {bucket.userCount}{" "}
                    {bucket.userCount === 1 ? "user" : "users"}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-secondary">
                  <div
                    className="h-2 rounded-full bg-primary transition-all"
                    style={{
                      width: `${(bucket.userCount / maxValue) * 100}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
