"use client";

import useSWR from "swr";
import { LoadingContent } from "@/components/LoadingContent";
import { NoReplyResponse } from "@/app/api/user/no-reply/route";
import { PageHeading } from "@/components/Typography";
import { EmailList } from "@/components/email-list/EmailList";

export default function NoReplyPage() {
  const { data, isLoading, error, mutate } = useSWR<
    NoReplyResponse,
    { error: string }
  >(`/api/user/no-reply`);

  return (
    <div>
      <div className="border-b border-gray-200 px-8 py-6">
        <PageHeading>Emails Sent With No Reply</PageHeading>
      </div>
      <LoadingContent loading={isLoading} error={error}>
        {data && (
          <div>
            <EmailList
              threads={data as any}
              hideActionBarWhenEmpty
              refetch={mutate}
            />
          </div>
        )}
      </LoadingContent>
    </div>
  );
}
