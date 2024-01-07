"use client";

import useSWR from "swr";
import { AlertBasic } from "@/components/Alert";
import { LoadingContent } from "@/components/LoadingContent";
import { EmailList } from "@/components/email-list/EmailList";
import { ColdEmailsResponse } from "@/app/api/user/cold-email/route";

export function ColdEmailList() {
  const { data, isLoading, error, mutate } =
    useSWR<ColdEmailsResponse>(`/api/user/cold-email`);

  return (
    <LoadingContent loading={isLoading} error={error}>
      {data && (
        <EmailList
          // threads={data.result}
          threads={[]}
          emptyMessage={
            <AlertBasic
              title="No cold emails!"
              description={`We haven't marked any of your emails as cold emails yet!`}
            />
          }
          hideActionBarWhenEmpty
          refetch={mutate}
        />
      )}
    </LoadingContent>
  );
}
