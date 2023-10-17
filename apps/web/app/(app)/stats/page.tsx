"use client";

import { useCallback, useMemo, useState } from "react";
import { ExpandIcon } from "lucide-react";
import useSWRImmutable from "swr/immutable";
import sortBy from "lodash/sortBy";
import { BarChart, Color, Title } from "@tremor/react";
import { capitalCase } from "capital-case";
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
import { RecipientsResponse } from "@/app/api/user/stats/recipients/route";
import { Button } from "@/components/Button";
import { CategoryStatsResponse } from "@/app/api/user/stats/categories/route";
import { DetailedStats } from "@/app/(app)/stats/DetailedStats";

export default function StatsPage() {
  return (
    <div className="pb-20">
      <StatsSummary />

      <div className="mx-4">
        <DetailedStats />
      </div>

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
        <EmailAnalytics />
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
      loadingComponent={<Skeleton className="m-4 h-64 rounded" />}
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

function EmailAnalytics() {
  const { data, isLoading, error } = useSWRImmutable<
    SendersResponse,
    { error: string }
  >(`/api/user/stats/senders`);
  const {
    data: dataRecipients,
    isLoading: isLoadingRecipients,
    error: errorRecipients,
  } = useSWRImmutable<RecipientsResponse, { error: string }>(
    `/api/user/stats/recipients`
  );
  const {
    data: dataCategories,
    isLoading: isLoadingCategories,
    error: errorCategories,
  } = useSWRImmutable<CategoryStatsResponse, { error: string }>(
    `/api/user/stats/categories`
  );

  const [expanded, setExpanded] = useState(false);

  const onExpand = useCallback(() => setExpanded(true), []);

  const extra = !expanded && (
    <div className="mt-2">
      <Button color="white" full onClick={onExpand}>
        <ExpandIcon className="h-4 w-4" />
        <span className="ml-3">Show more</span>
      </Button>
    </div>
  );

  return (
    <div className="grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
      <LoadingContent
        loading={isLoading}
        error={error}
        loadingComponent={<Skeleton className="h-64 w-full rounded" />}
      >
        {data && (
          <BarList
            title="Who is sending you the most emails"
            subtitle="Last 50 emails"
            col1="Sender"
            col2="Emails"
            data={sortBy(
              Object.entries(data.countBySender),
              ([, count]) => -count
            )
              .slice(0, expanded ? undefined : 5)
              .map(([sender, count]) => ({
                name: sender,
                value: count,
              }))}
            extra={extra}
          />
        )}
      </LoadingContent>
      <LoadingContent
        loading={isLoading}
        error={error}
        loadingComponent={<Skeleton className="h-64 w-full rounded" />}
      >
        {data && (
          <BarList
            title="Domains sending you the most emails"
            subtitle="Last 50 emails"
            col1="Domain"
            col2="Emails"
            data={sortBy(
              Object.entries(data.countByDomain),
              ([, count]) => -count
            )
              .slice(0, expanded ? undefined : 5)
              .map(([sender, count]) => ({
                name: sender,
                value: count,
              }))}
            extra={extra}
          />
        )}
      </LoadingContent>
      <LoadingContent
        loading={isLoadingRecipients}
        error={errorRecipients}
        loadingComponent={<Skeleton className="h-64 w-full rounded" />}
      >
        {dataRecipients && (
          <BarList
            title="Who you send the most emails"
            subtitle="Last 50 emails"
            col1="Recipient"
            col2="Emails"
            data={sortBy(
              Object.entries(dataRecipients.countByRecipient),
              ([, count]) => -count
            )
              .slice(0, expanded ? undefined : 5)
              .map(([sender, count]) => ({
                name: sender,
                value: count,
              }))}
            extra={extra}
          />
        )}
      </LoadingContent>
      <LoadingContent
        loading={isLoadingCategories}
        error={errorCategories}
        loadingComponent={<Skeleton className="h-64 w-full rounded" />}
      >
        {dataCategories && (
          <BarList
            title="What types of emails you're receiving"
            subtitle="Last 50 threads"
            col1="Category"
            col2="Emails"
            data={sortBy(
              Object.entries(dataCategories.countByCategory),
              ([, count]) => -count
            )
              .slice(0, expanded ? undefined : 5)
              .map(([category, count]) => ({
                name:
                  category === "undefined"
                    ? "Uncategorized"
                    : capitalCase(category),
                value: count,
              }))}
            extra={extra}
          />
        )}
      </LoadingContent>
    </div>
  );
}

// we are limiting our queries to max 500 emails.
// so if the number returned is 500 this likely means there are 500+.
function formatStat(stat?: number) {
  if (stat === 500) return "500+";

  return stat || 0;
}
