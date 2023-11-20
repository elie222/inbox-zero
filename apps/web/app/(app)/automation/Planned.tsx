"use client";

import useSWR from "swr";
// import { List } from "@/components/email-list/EmailList";
import { LoadingContent } from "@/components/LoadingContent";
import { PlannedResponse } from "@/app/api/user/planned/route";
import { Button } from "@/components/Button";
import { postRequest } from "@/utils/api";
import { CheckCircleIcon, XCircleIcon } from "@heroicons/react/24/outline";
import {
  ExecutePlanBody,
  ExecutePlanResponse,
} from "@/app/api/user/planned/[id]/controller";
import { useState } from "react";
import { toastError, toastSuccess } from "@/components/Toast";
import { AlertBasic } from "@/components/Alert";

export function Planned() {
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
        <AlertBasic
          title="No planned actions"
          description="Set rules above for our AI to handle incoming emails for you."
        />
      )}
    </LoadingContent>
  );
}
