"use client";

import useSWR from "swr";
import { Stats } from "@/components/Stats";
import { StatsResponse } from "@/app/api/user/stats/route";
import { LoadingContent } from "@/components/LoadingContent";

export default function StatsPage() {
  const { data, isLoading, error } = useSWR<StatsResponse>(`/api/user/stats`);

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <Stats
          stats={[
            {
              name: "Emails received (last 24h)",
              value: data.emailsReceived24hrs || 0,
            },
            {
              name: "Archived emails (last 24h)",
              value: data.emailsArchived24hrs || 0,
            },
            {
              name: "Emails sent (last 24h)",
              value: data.emailsSent24hrs || 0,
            },
          ]}
        />
      )}
    </LoadingContent>
  );
}
