"use client";

import { useMemo } from "react";
import useSWRImmutable from "swr/immutable";
import { BarChart, Color, Title } from "@tremor/react";
import { Card } from "@/components/Card";
import { Skeleton } from "@/components/ui/skeleton";
import { Stats } from "@/components/Stats";
import { StatsResponse } from "@/app/api/user/stats/route";
import { LoadingContent } from "@/components/LoadingContent";
import {
  StatsByDayQuery,
  StatsByDayResponse,
} from "@/app/api/user/stats/day/route";
import { BarList } from "@/components/charts/BarList";
import { SendersResponse } from "@/app/api/user/stats/senders/route";
import { sortBy } from "lodash";

export default function StatsPage() {
  return (
    <div className="pb-20">
      <StatsSummary />

      <div className="mt-4 grid gap-4 px-4 md:grid-cols-3">
        <div>
          <StatsChart type="inbox" title="Inbox Emails" color="blue" />
        </div>
        <div>
          <StatsChart type="archived" title="Archived Emails" color="lime" />
        </div>
        <div>
          <StatsChart type="sent" title="Sent Emails" color="slate" />
        </div>
      </div>

      <div className="mt-4 px-4">
        <CombinedStatsChart title="Combined Chart" />
      </div>

      <div className="mt-4 px-4">
        <SenderAnalytics />
      </div>
    </div>
  );
}

function StatsSummary() {
  const { data, isLoading, error } =
    useSWRImmutable<StatsResponse>(`/api/user/stats`);

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="m-4 h-64 w-full rounded" />}
    >
      {data && (
        <div>
          <Stats
            stats={[
              {
                name: "Emails received (last 24h)",
                value: formatStat(data.emailsReceived24hrs),
              },
              {
                name: "Inbox emails (last 24h)",
                value: formatStat(data.emailsInbox24hrs),
              },
              {
                name: "Emails sent (last 24h)",
                value: formatStat(data.emailsSent24hrs),
              },

              {
                name: "Emails received (last 7d)",
                value: formatStat(data.emailsReceived7days),
                subvalue: `${((data.emailsReceived7days || 0) / 7).toFixed(
                  1
                )} per day`,
              },
              {
                name: "Inbox emails (last 7d)",
                value: formatStat(data.emailsInbox7days),
                subvalue: `${((data.emailsInbox7days || 0) / 7).toFixed(
                  1
                )} per day`,
              },
              {
                name: "Emails sent (last 7d)",
                value: formatStat(data.emailsSent7days),
                subvalue: `${((data.emailsSent7days || 0) / 7).toFixed(
                  1
                )} per day`,
              },
            ]}
          />
        </div>
      )}
    </LoadingContent>
  );
}

function StatsChart(props: {
  title: string;
  type: StatsByDayQuery["type"];
  color: Color;
}) {
  const searchParams: StatsByDayQuery = { type: props.type };
  const { data, isLoading, error } = useSWRImmutable<
    StatsByDayResponse,
    { error: string }
  >(`/api/user/stats/day?${new URLSearchParams(searchParams).toString()}`);

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="h-64 w-full rounded" />}
    >
      {data && (
        <div className="mx-auto max-w-2xl">
          <Card>
            <Title>{props.title}</Title>
            <BarChart
              className="mt-4 h-72"
              data={data}
              index="date"
              categories={["Emails"]}
              colors={[props.color]}
            />
          </Card>
        </div>
      )}
    </LoadingContent>
  );
}

function CombinedStatsChart(props: { title: string }) {
  const {
    data: sentData,
    isLoading: sentIsLoading,
    error: sentError,
  } = useSWRImmutable<StatsByDayResponse, { error: string }>(
    `/api/user/stats/day?${new URLSearchParams({
      type: "sent",
    } as StatsByDayQuery).toString()}`
  );

  const {
    data: archivedData,
    isLoading: archivedIsLoading,
    error: archivedError,
  } = useSWRImmutable<StatsByDayResponse, { error: string }>(
    `/api/user/stats/day?${new URLSearchParams({
      type: "archived",
    } as StatsByDayQuery).toString()}`
  );

  const {
    data: inboxData,
    isLoading: inboxIsLoading,
    error: inboxError,
  } = useSWRImmutable<StatsByDayResponse, { error: string }>(
    `/api/user/stats/day?${new URLSearchParams({
      type: "inbox",
    } as StatsByDayQuery).toString()}`
  );

  const isLoading = sentIsLoading || archivedIsLoading || inboxIsLoading;
  const error = sentError || archivedError || inboxError;
  const hasAllData = sentData && archivedData && inboxData;

  const data = useMemo(() => {
    if (!hasAllData) return [];

    const data: {
      date: string;
      Unhandled: number;
      Archived: number;
      Sent: number;
    }[] = [];

    for (let i = 0; i < inboxData.length; i++) {
      data.push({
        date: inboxData[i].date,
        Unhandled: inboxData[i].Emails,
        Archived: archivedData[i].Emails,
        Sent: sentData[i].Emails,
      });
    }

    return data;
  }, [archivedData, hasAllData, inboxData, sentData]);

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="h-64 w-full rounded" />}
    >
      {hasAllData && (
        <div className="mx-auto">
          <Card>
            <Title>{props.title}</Title>
            <BarChart
              className="mt-4 h-72"
              data={data}
              index="date"
              categories={["Unhandled", "Archived", "Sent"]}
              colors={["blue", "lime", "slate"]}
            />
          </Card>
        </div>
      )}
    </LoadingContent>
  );
}

function SenderAnalytics() {
  const { data, isLoading, error } = useSWRImmutable<
    SendersResponse,
    { error: string }
  >(`/api/user/stats/senders`);

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="m-4 h-64 w-full rounded" />}
    >
      {data && (
        <div className="grid gap-4 sm:grid-cols-3">
          <BarList
            title="Sender Analytics"
            col1="Sender"
            col2="Emails"
            data={sortBy(
              Object.entries(data.countBySender),
              ([, count]) => -count
            ).map(([sender, count]) => ({
              name: sender,
              value: count,
            }))}
          />
          <BarList
            title="Sender Domain Analytics"
            col1="Domain"
            col2="Emails"
            data={sortBy(
              Object.entries(data.countByDomain),
              ([, count]) => -count
            ).map(([sender, count]) => ({
              name: sender,
              value: count,
            }))}
          />
        </div>
      )}
    </LoadingContent>
  );
}

// we are limiting our queries to max 500 emails.
// so if the number returned is 500 this likely means there are 500+.
function formatStat(stat?: number) {
  if (stat === 500) return "500+";

  return stat || 0;
}
