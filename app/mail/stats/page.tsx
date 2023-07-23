"use client";

import useSWRImmutable from "swr/immutable";
import { BarChart, Card, Title } from "@tremor/react";
import { Stats } from "@/components/Stats";
import { StatsResponse } from "@/app/api/user/stats/route";
import { LoadingContent } from "@/components/LoadingContent";
import {
  StatsByDayQuery,
  StatsByDayResponse,
} from "@/app/api/user/stats/day/route";

export default function StatsPage() {
  return (
    <div>
      <StatsSummary />
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <div className="">
          <StatsChart type="inbox" title="Unhandled Emails" />
        </div>
        <div className="">
          <StatsChart type="sent" title="Sent Emails" />
        </div>
      </div>
    </div>
  );
}

function StatsSummary() {
  const { data, isLoading, error } =
    useSWRImmutable<StatsResponse>(`/api/user/stats`);

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <div>
          <Stats
            stats={[
              {
                name: "Emails received (last 24h)",
                value: data.emailsReceived24hrs || 0,
              },
              {
                name: "Inbox emails (last 24h)",
                value: data.emailsInbox24hrs || 0,
              },
              {
                name: "Emails sent (last 24h)",
                value: data.emailsSent24hrs || 0,
              },

              {
                name: "Emails received (last 7d)",
                value: data.emailsReceived7days || 0,
                subvalue: `${((data.emailsReceived7days || 0) / 7).toFixed(
                  1
                )} per day`,
              },
              {
                name: "Inbox emails (last 7d)",
                value: data.emailsInbox7days || 0,
                subvalue: `${((data.emailsInbox7days || 0) / 7).toFixed(
                  1
                )} per day`,
              },
              {
                name: "Emails sent (last 7d)",
                value: data.emailsSent7days || 0,
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

function StatsChart(props: { title: string; type: "inbox" | "sent" }) {
  const searchParams: StatsByDayQuery = { type: props.type };
  const { data, isLoading, error } = useSWRImmutable<
    StatsByDayResponse,
    { error: string }
  >(`/api/user/stats/day?${new URLSearchParams(searchParams).toString()}`);

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <div className="mx-auto max-w-2xl">
          <Card>
            <Title>{props.title}</Title>
            <BarChart
              className="mt-4 h-72"
              data={data}
              index="date"
              categories={["Emails"]}
              colors={["blue"]}
            />
          </Card>
        </div>
      )}
    </LoadingContent>
  );
}
