"use client";

import useSWR from "swr";
import { Mail, Sparkles, Users } from "lucide-react";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OrgStatsResponse } from "@/app/api/organizations/[organizationId]/stats/route";

export function OrgStats({ organizationId }: { organizationId: string }) {
  const { data, isLoading, error } = useSWR<OrgStatsResponse>(
    `/api/organizations/${organizationId}/stats`,
  );

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <Skeleton className="h-64" />
            <Skeleton className="h-64" />
          </div>
        </div>
      }
    >
      {data && (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid gap-4 md:grid-cols-3">
            <StatCard
              title="Total Emails Received"
              value={data.totals.totalEmails.toLocaleString()}
              icon={<Mail className="h-4 w-4 text-muted-foreground" />}
            />
            <StatCard
              title="Rules Executed"
              value={data.totals.totalRules.toLocaleString()}
              icon={<Sparkles className="h-4 w-4 text-muted-foreground" />}
            />
            <StatCard
              title="Active Members"
              value={data.totals.activeMembers.toLocaleString()}
              icon={<Users className="h-4 w-4 text-muted-foreground" />}
            />
          </div>

          {/* Distribution Charts */}
          <div className="grid gap-4 md:grid-cols-2">
            <BucketChart
              title="Email Volume Distribution"
              description="Number of users by emails received"
              data={data.emailBuckets}
              emptyMessage="No email data available. Users need to load their stats first."
            />
            <BucketChart
              title="Automation Usage Distribution"
              description="Number of users by rules executed"
              data={data.rulesBuckets}
              emptyMessage="No automation data yet."
            />
          </div>
        </div>
      )}
    </LoadingContent>
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
}: {
  title: string;
  description: string;
  data: { label: string; userCount: number }[];
  emptyMessage: string;
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
                    {bucket.label} emails
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
