"use client";

import useSWR from "swr";
import { List } from "@/components/email-list/EmailList";
import { useSearchParams } from "next/navigation";
import { LoadingContent } from "@/components/LoadingContent";
import { PlannedResponse } from "@/app/api/user/planned/route";
import Link from "next/link";
import { Card } from "@/components/Card";
import { Button } from "@/components/Button";
import { postRequest } from "@/utils/api";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";
import {
  ExecutePlanBody,
  ExecutePlanResponse,
} from "@/app/api/user/planned/[id]/controller";
import { useState } from "react";
import { toastError, toastSuccess } from "@/components/Toast";
import { Tabs } from "@/components/Tabs";
import { PlanHistoryResponse } from "@/app/api/user/planned/history/route";
import { PlanBadge } from "@/components/PlanBadge";

export default function PlannedPage() {
  const params = useSearchParams();
  const selectedTab = params.get("tab") || "history";

  return (
    <div>
      <div className="p-2">
        <Tabs
          selected={selectedTab}
          tabs={[
            {
              label: "History",
              value: "history",
              href: "/planned?tab=history",
            },
            // {
            //   label: "Planned",
            //   value: "planned",
            //   href: "/planned?tab=planned",
            // },
          ]}
          breakpoint="md"
        />
      </div>

      {selectedTab === "planned" && <Planned />}
      {selectedTab === "history" && <PlanHistory />}
    </div>
  );
}

function Planned() {
  const { data, isLoading, error, mutate } = useSWR<PlannedResponse>(
    "/api/user/planned",
    {
      keepPreviousData: true,
      dedupingInterval: 1_000,
    }
  );

  const [executing, setExecuting] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  return (
    <LoadingContent loading={isLoading} error={error}>
      {/* {data && <List emails={data?.messages || []} refetch={mutate} />} */}
      {data?.messages?.length ? (
        <div className="">
          {/* <List emails={data.messages || []} refetch={mutate} /> */}
          {data.messages.map((message) => {
            return (
              <div
                key={message.id}
                className="flex items-center justify-between border-b border-gray-200 p-4"
              >
                <div>
                  {message.snippet ||
                    message.parsedMessage.textPlain?.substring(0, 100) ||
                    message.parsedMessage.headers?.from}
                </div>
                <div className="ml-4 flex items-center">
                  <div className="whitespace-nowrap">
                    {message.plan.rule?.actions.map((a) => a.type).join(", ") ||
                      "No plan"}
                  </div>
                  <div className="ml-2 flex space-x-2">
                    <Button
                      color="white"
                      roundedSize="full"
                      loading={executing}
                      onClick={async () => {
                        if (!message.plan.rule) return;

                        setExecuting(true);

                        try {
                          await postRequest<
                            ExecutePlanResponse,
                            ExecutePlanBody
                          >(`/api/user/planned/${message.plan.id}`, {
                            email: {
                              subject: message.parsedMessage.headers.subject,
                              from: message.parsedMessage.headers.from,
                              to: message.parsedMessage.headers.to,
                              cc: message.parsedMessage.headers.cc,
                              replyTo:
                                message.parsedMessage.headers["reply-to"],
                              references:
                                message.parsedMessage.headers["references"],
                              date: message.parsedMessage.headers.date,
                              headerMessageId:
                                message.parsedMessage.headers["message-id"],
                              textPlain:
                                message.parsedMessage.textPlain || null,
                              textHtml: message.parsedMessage.textHtml || null,
                              snippet: message.snippet || null,
                              messageId: message.id || "",
                              threadId: message.threadId || "",
                            },
                            ruleId: message.plan.rule.id,
                            actions: message.plan.rule.actions,
                            args: message.plan.functionArgs,
                          });

                          toastSuccess({ description: "Executed!" });
                        } catch (error) {
                          console.error(error);
                          toastError({
                            description: "Unable to execute plan :(",
                          });
                        }

                        setExecuting(false);
                      }}
                    >
                      <CheckCircleIcon className="h-6 w-6" />
                    </Button>

                    <Button
                      color="white"
                      roundedSize="full"
                      loading={rejecting}
                      onClick={() => {
                        setRejecting(true);

                        setTimeout(() => {
                          setRejecting(false);
                        }, 1_000);
                      }}
                    >
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
  );
}

function PlanHistory() {
  const { data, isLoading, error } = useSWR<PlanHistoryResponse>(
    "/api/user/planned/history",
    {
      keepPreviousData: true,
    }
  );

  return (
    <LoadingContent loading={isLoading} error={error}>
      <div className="">
        {data?.history.map((h) => {
          return (
            <div
              key={h.id}
              className="flex items-center justify-between border-b border-gray-200 px-4 py-3"
            >
              <div className="whitespace-nowrap">
                <PlanBadge
                  plan={{
                    rule: {
                      name: h.rule?.name || "",
                      actions: h.actions.map((actionType) => {
                        return { type: actionType };
                      }),
                    },
                    databaseRule: {
                      instructions: h.rule?.instructions || "",
                    },
                  }}
                />
              </div>
              {/* {JSON.stringify(h, null, 2)} */}
              <div>
                {h.actions.map((action, i) => {
                  return (
                    <div key={i} className="p-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <div className="font-semibold">{action}</div>
                          {/* <div className="text-gray-500">{a.args}</div> */}
                        </div>
                        {/* <div className="text-gray-500">{a.createdAt}</div> */}
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="">
                {Object.entries(h.data as any).map(
                  ([key, value]: [string, any]) => {
                    return (
                      <div key={key} className="flex items-center space-x-2">
                        <div className="font-semibold">{key}</div>
                        <div className="text-gray-500">{value}</div>
                      </div>
                    );
                  }
                )}
              </div>
              <div className="">{h.automated ? "Automated" : "Manual"}</div>
            </div>
          );
        })}
      </div>
      {!data?.history?.length && (
        <div className="p-4">
          <Card>No history.</Card>
        </div>
      )}
    </LoadingContent>
  );
}
