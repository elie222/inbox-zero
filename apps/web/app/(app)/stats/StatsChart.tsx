import { Color, Card, Title, BarChart } from "@tremor/react";
import useSWRImmutable from "swr/immutable";
import {
  StatsByDayQuery,
  StatsByDayResponse,
} from "@/app/api/user/stats/day/route";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";

export function StatsChart(props: {
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
