"use client";

import useSWR from "swr";
import { LoadingContent } from "@/components/LoadingContent";
import { NoReplyResponse } from "@/app/api/user/no-reply/route";
import { PageHeading } from "@/components/Typography";
import { EmailList } from "@/components/ListNew";

export default function NoReplyPage() {
  const { data, isLoading, error } = useSWR<NoReplyResponse, { error: string }>(
    `/api/user/no-reply`
  );

  return (
    <div>
      <div className="border-b border-gray-200 px-8 py-6">
        <PageHeading>Emails Sent With No Reply</PageHeading>
      </div>
      <LoadingContent loading={isLoading} error={error}>
        {data && (
          <div>
            <EmailList threads={data as any} refetch={() => {}} />
          </div>
        )}
      </LoadingContent>
    </div>
  );
}
