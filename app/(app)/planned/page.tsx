"use client";

import useSWR from "swr";
import { List } from "@/components/ListNew";
import { LoadingContent } from "@/components/LoadingContent";
import { PlannedResponse } from "@/app/api/user/planned/route";
import Link from "next/link";
import { Card } from "@tremor/react";

export default function Home() {
  const { data, isLoading, error, mutate } = useSWR<PlannedResponse>(
    "/api/user/planned",
    {
      keepPreviousData: true,
      dedupingInterval: 1_000,
    }
  );

  return (
    <LoadingContent loading={isLoading} error={error}>
      {/* {data && <List emails={data?.messages || []} refetch={mutate} />} */}
      {data?.messages.length ? (
        <div className="border-b border-gray-200 p-4">
          {data.messages.map((message) => {
            return (
              <div key={message.id} className="flex justify-between">
                <div>{message.snippet}</div>
                <div>
                  {message.plan.rule.actions.map((a) => a.type).join(", ")}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="mx-auto max-w-2xl p-8">
          <Card>
            No planned actions. Set rules in your{" "}
            <Link href="/settings" className="font-semibold hover:underline">
              Settings
            </Link>{" "}
            for the AI to handle incoming emails for you.
          </Card>
        </div>
      )}
    </LoadingContent>
  );
}
