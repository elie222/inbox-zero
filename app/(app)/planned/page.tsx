"use client";

import useSWR from "swr";
import { List } from "@/components/ListNew";
import { LoadingContent } from "@/components/LoadingContent";
import { PlannedResponse } from "@/app/api/user/planned/route";
import Link from "next/link";
import { Card } from "@tremor/react";
import { Button } from "@/components/Button";
import { postRequest } from "@/utils/api";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";

export default function Home() {
  const { data, isLoading, error } = useSWR<PlannedResponse>(
    "/api/user/planned",
    {
      keepPreviousData: true,
      dedupingInterval: 1_000,
    }
  );

  return (
    <div>
      <LoadingContent loading={isLoading} error={error}>
        {/* {data && <List emails={data?.messages || []} refetch={mutate} />} */}
        {data?.messages.length ? (
          <div className="border-b border-gray-200 p-4">
            {data.messages.map((message) => {
              return (
                <div
                  key={message.id}
                  className="flex items-center justify-between"
                >
                  <div>{message.snippet}</div>
                  <div className="flex items-center">
                    <div>
                      {message.plan.rule.actions.map((a) => a.type).join(", ")}
                    </div>
                    <div className="ml-2 space-x-2">
                      <Button color="white" roundedSize="full">
                        <CheckCircleIcon className="h-6 w-6" />
                      </Button>

                      <Button color="white" roundedSize="full">
                        <XCircleIcon className="h-6 w-6" />
                      </Button>
                    </div>
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

      <div className="mx-auto max-w-2xl p-8">
        <RunRules />
      </div>
    </div>
  );
}

function RunRules() {
  return (
    <Card>
      <p>Run AI on last 10 emails.</p>
      <div className="mt-4">
        <Button
          onClick={() => {
            postRequest("/api/user/planned/run", {});
          }}
        >
          Run
        </Button>
      </div>
    </Card>
  );
}
