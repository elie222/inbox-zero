"use client";

import { DateRange } from "react-day-picker";
import useSWR from "swr";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import {
  MailCheckIcon,
  MailOpenIcon,
  MailsIcon,
  SendHorizonalIcon,
} from "lucide-react";
import {
  StatsByWeekParams,
  StatsByWeekResponse,
} from "@/app/api/user/stats/tinybird/route";
import { getDateRangeParams } from "./params";

export function StatsSummary(props: { dateRange?: DateRange }) {
  const { dateRange } = props;

  const params: StatsByWeekParams = {
    period: "week",
    ...getDateRangeParams(dateRange),
  };

  const { data, isLoading, error } = useSWR<
    StatsByWeekResponse,
    { error: string }
  >(`/api/user/stats/tinybird?${new URLSearchParams(params as any)}`);

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="h-64 rounded" />}
    >
      {data && (
        <div>
          <StatsCards
            stats={[
              {
                name: "Received",
                value: formatStat(data.allCount),
                subvalue: "emails",
                icon: <MailsIcon className="h-4 w-4" />,
              },
              {
                name: "Read",
                value: formatStat(data.readCount),
                subvalue: "emails",
                icon: <MailOpenIcon className="h-4 w-4" />,
              },
              {
                name: "Archived",
                value: formatStat(data.allCount - data.inboxCount),
                subvalue: "emails",
                icon: <MailCheckIcon className="h-4 w-4" />,
              },
              {
                name: "Sent",
                value: formatStat(data.sentCount),
                subvalue: "emails",
                icon: <SendHorizonalIcon className="h-4 w-4" />,
              },
            ]}
          />
        </div>
      )}
    </LoadingContent>
  );
}

function StatsCards(props: {
  stats: {
    name: string;
    value: string | number;
    subvalue?: string;
    icon: React.ReactNode;
  }[];
}) {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {props.stats.map((stat) => {
        return (
          <Card key={stat.name}>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">{stat.name}</CardTitle>
              {stat.icon}
            </CardHeader>
            <CardContent>
              <div className="">
                <span className="text-2xl font-bold">{stat.value}</span>
                <span className="text-muted-foreground ml-2 text-sm">
                  {stat.subvalue}
                </span>
              </div>
              {/* <p className="text-muted-foreground text-xs">{stat.subvalue}</p> */}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function formatStat(stat?: number) {
  return stat ? stat.toLocaleString() : 0;
}
