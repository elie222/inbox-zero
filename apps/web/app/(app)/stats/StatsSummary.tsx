"use client";

import useSWRImmutable from "swr/immutable";
import { StatsResponse } from "@/app/api/user/stats/route";
import { LoadingContent } from "@/components/LoadingContent";
import { Skeleton } from "@/components/ui/skeleton";
import { Stats } from "@/components/Stats";

export function StatsSummary() {
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

// we are limiting our queries to max 500 emails.
// so if the number returned is 500 this likely means there are 500+.
function formatStat(stat?: number) {
  if (stat === 500) return "500+";

  return stat || 0;
}
