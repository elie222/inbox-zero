"use client";

import useSWR from "swr";
import { LoadingContent } from "@/components/LoadingContent";
import { NoReplyResponse } from "@/app/api/user/no-reply/route";
import { PageHeading } from "@/components/Typography";
import { List } from "@/components/ListNew";

export default function NoReplyPage() {
  const { data, isLoading, error } = useSWR<NoReplyResponse, { error: string }>(
    `/api/user/no-reply`
  );

  return (
    <div>
      <div className="p-4">
        <PageHeading>Emails Sent With No Reply</PageHeading>
      </div>
      <LoadingContent loading={isLoading} error={error}>
        {data && (
          <div>
            <List emails={data as any} refetch={() => {}} />
          </div>
        )}
      </LoadingContent>
    </div>
  );
}
