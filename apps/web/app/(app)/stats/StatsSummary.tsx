"use client";

import { DateRange } from "react-day-picker";
import useSWR from "swr";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
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
import { formatStat } from "@/utils/stats";
import { StatsCards } from "@/components/StatsCards";

export function StatsSummary(props: {
  dateRange?: DateRange;
  refreshInterval: number;
}) {
  const { dateRange } = props;

  const params: StatsByWeekParams = {
    period: "week",
    ...getDateRangeParams(dateRange),
  };

  const { data, isLoading, error } = useSWR<
    StatsByWeekResponse,
    { error: string }
  >(`/api/user/stats/tinybird?${new URLSearchParams(params as any)}`, {
    refreshInterval: props.refreshInterval,
  });

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
