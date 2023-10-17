import useSWRImmutable from "swr/immutable";
import { DatePickerWithRange } from "@/components/DatePickerWithRange";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/Card";
import { BarChart, Title } from "@tremor/react";
import { StatsByWeekResponse } from "@/app/api/user/stats/tinybird/route";

export function DetailedStats() {
  const { data, isLoading, error } = useSWRImmutable<
    StatsByWeekResponse,
    { error: string }
  >("/api/user/stats/tinybird");

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="h-64 w-full rounded" />}
    >
      {data && (
        <div>
          <div className="flex justify-end">
            <DatePickerWithRange
              from={new Date()}
              to={new Date()}
              onSelect={() => {}}
            />
          </div>

          <div className="mt-2">
            <Card>
              <Title>Detailed Analytics</Title>
              <BarChart
                className="mt-4 h-72"
                data={data.result}
                index="week_start"
                categories={["All", "Read", "Unread", "Sent"]}
                colors={["blue", "amber", "cyan", "emerald"]}
              />
            </Card>
          </div>
        </div>
      )}
    </LoadingContent>
  );
}
