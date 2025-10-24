"use client";

import useSWR from "swr";
import { LoadingContent } from "@/components/LoadingContent";
import type { NoReplyResponse } from "@/app/api/user/no-reply/route";
import { PageHeading } from "@/components/Typography";
import { EmailList } from "@/components/email-list/EmailList";
import type { Thread } from "@/components/email-list/types";

export default function NoReplyPage() {
  const { data, isLoading, error, mutate } = useSWR<
    NoReplyResponse,
    { error: string }
  >("/api/user/no-reply");

  return (
    <div>
      <div className="border-b border-border px-8 py-6">
        <PageHeading>Emails Sent With No Reply</PageHeading>
      </div>
      <LoadingContent loading={isLoading} error={error}>
        {data && (
          <div>
            <EmailList
              threads={data.map((item) => ({
                id: item.thread.id,
                messages: item.thread.messages,
                snippet: item.thread.snippet,
                plan: undefined, // No plan data available for sent messages
                category: null, // No category data available for sent messages
              }))}
              hideActionBarWhenEmpty
              refetch={() => mutate()}
            />
          </div>
        )}
      </LoadingContent>
    </div>
  );
}
