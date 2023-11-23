"use client";

import useSWR from "swr";
import { EmailList } from "@/components/email-list/EmailList";
import { LoadingContent } from "@/components/LoadingContent";
import { PlannedResponse } from "@/app/api/user/planned/route";
import { AlertBasic } from "@/components/Alert";

export function Planned() {
  const { data, isLoading, error, mutate } = useSWR<PlannedResponse>(
    "/api/user/planned",
    {
      keepPreviousData: true,
      dedupingInterval: 1_000,
    },
  );

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <EmailList
          threads={data.messages || []}
          emptyMessage={
            <div className="px-6">
              <AlertBasic
                title="No planned emails"
                description="Set rules above for our AI to handle incoming emails for you."
              />
            </div>
          }
          hideActionBarWhenEmpty
          refetch={mutate}
        />
      )}
    </LoadingContent>
  );
}
