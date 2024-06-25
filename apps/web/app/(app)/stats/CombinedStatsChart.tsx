import { BarChart, Card, Title } from "@tremor/react";
import { useMemo } from "react";
import useSWRImmutable from "swr/immutable";
import type {
  StatsByDayResponse,
  StatsByDayQuery,
} from "@/app/api/user/stats/day/route";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";

export function CombinedStatsChart(props: { title: string }) {
  const {
    data: sentData,
    isLoading: sentIsLoading,
    error: sentError,
  } = useSWRImmutable<StatsByDayResponse, { error: string }>(
    `/api/user/stats/day?${new URLSearchParams({
      type: "sent",
    } as StatsByDayQuery).toString()}`,
  );

  const {
    data: archivedData,
    isLoading: archivedIsLoading,
    error: archivedError,
  } = useSWRImmutable<StatsByDayResponse, { error: string }>(
    `/api/user/stats/day?${new URLSearchParams({
      type: "archived",
    } as StatsByDayQuery).toString()}`,
  );

  const {
    data: inboxData,
    isLoading: inboxIsLoading,
    error: inboxError,
  } = useSWRImmutable<StatsByDayResponse, { error: string }>(
    `/api/user/stats/day?${new URLSearchParams({
      type: "inbox",
    } as StatsByDayQuery).toString()}`,
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
