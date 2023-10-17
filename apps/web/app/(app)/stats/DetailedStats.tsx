import { useState } from "react";
import useSWRImmutable from "swr/immutable";
import { DatePickerWithRange } from "@/components/DatePickerWithRange";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { Card } from "@/components/Card";
import { BarChart, Title } from "@tremor/react";
import { StatsByWeekResponse } from "@/app/api/user/stats/tinybird/route";
import { DetailedStatsFilter } from "@/app/(app)/stats/DetailedStatsFilter";

export function DetailedStats() {
  const { data, isLoading, error } = useSWRImmutable<
    StatsByWeekResponse,
    { error: string }
  >("/api/user/stats/tinybird");

  const [visibleBars, setVisibleBars] = useState<
    Record<"all" | "read" | "unread" | "sent", boolean>
  >({
    all: true,
    read: true,
    unread: true,
    sent: true,
  });

  return (
    <LoadingContent
      loading={isLoading}
      error={error}
      loadingComponent={<Skeleton className="h-64 w-full rounded" />}
    >
      {data && (
        <div>
          <div className="mt-2">
            <Card>
              <div className="flex items-center justify-between">
                <Title>Detailed Analytics</Title>
                <div className="flex space-x-2">
                  <DetailedStatsFilter
                    columns={[
                      {
                        label: "All",
                        checked: visibleBars.all,
                        setChecked: () =>
                          setVisibleBars({
                            ...visibleBars,
                            ["all"]: !visibleBars.all,
                          }),
                      },
                      {
                        label: "Read",
                        checked: visibleBars.read,
                        setChecked: () =>
                          setVisibleBars({
                            ...visibleBars,
                            ["read"]: !visibleBars.read,
                          }),
                      },
                      {
                        label: "Unread",
                        checked: visibleBars.unread,
                        setChecked: () =>
                          setVisibleBars({
                            ...visibleBars,
                            ["unread"]: !visibleBars.unread,
                          }),
                      },
                      {
                        label: "Sent",
                        checked: visibleBars.sent,
                        setChecked: () =>
                          setVisibleBars({
                            ...visibleBars,
                            ["sent"]: !visibleBars.sent,
                          }),
                      },
                    ]}
                  />
                  <DatePickerWithRange
                    from={new Date()}
                    to={new Date()}
                    onSelect={() => {}}
                  />
                </div>
              </div>

              <BarChart
                className="mt-4 h-72"
                data={data.result}
                index="week_start"
                categories={[
                  visibleBars.all ? "All" : "",
                  visibleBars.read ? "Read" : "",
                  visibleBars.unread ? "Unread" : "",
                  visibleBars.sent ? "Sent" : "",
                ]}
                colors={["blue", "amber", "cyan", "emerald"]}
              />
            </Card>
          </div>
        </div>
      )}
    </LoadingContent>
  );
}
