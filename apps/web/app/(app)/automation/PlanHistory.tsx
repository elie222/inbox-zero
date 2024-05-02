"use client";

import useSWR from "swr";
import { useSession } from "next-auth/react";
import { capitalCase } from "capital-case";
import { ExternalLinkIcon } from "lucide-react";
import { LoadingContent } from "@/components/LoadingContent";
import { PlanHistoryResponse } from "@/app/api/user/planned/history/route";
import { PlanBadge } from "@/components/PlanBadge";
import { AlertBasic } from "@/components/Alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tooltip } from "@/components/Tooltip";
import { MessagesBatchResponse } from "@/app/api/google/messages/batch/route";
import { LoadingMiniSpinner } from "@/components/Loading";
import { getGmailUrl } from "@/utils/url";
import { Badge } from "@/components/Badge";
import { EmailDate } from "@/components/email-list/EmailDate";
import { getActionFields } from "@/utils/actionType";

export function PlanHistory() {
  const session = useSession();

  const { data, isLoading, error } = useSWR<PlanHistoryResponse>(
    "/api/user/planned/history",
    {
      keepPreviousData: true,
    },
  );

  const {
    data: dataMessages,
    isLoading: isLoadingMessages,
    error: errorMessages,
  } = useSWR<MessagesBatchResponse>(
    data
      ? `/api/google/messages/batch?${new URLSearchParams(
          data.history.slice(0, 100).map((h) => ["messageIds", h.messageId]),
        )}`
      : null,
    {
      keepPreviousData: true,
    },
  );

  if (errorMessages) console.error(errorMessages);

  return (
    <LoadingContent loading={isLoading} error={error}>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Subject</TableHead>
            <TableHead>Rule</TableHead>
            <TableHead>Actions</TableHead>
            <TableHead>Values</TableHead>
            <TableHead>Execution</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.history.map((h) => {
            const message = dataMessages?.messages.find(
              (m) => m.id === h.messageId,
            );

            const openInGmailButton = (
              <button
                className="ml-4 text-gray-700 hover:text-gray-900"
                onClick={() => {
                  window.open(
                    getGmailUrl(h.messageId, session.data?.user.email),
                    "_blank",
                  );
                }}
              >
                <ExternalLinkIcon className="h-4 w-4" />
              </button>
            );

            return (
              <TableRow key={h.id}>
                <TableCell>
                  {isLoadingMessages ? (
                    <LoadingMiniSpinner />
                  ) : message ? (
                    <Tooltip
                      content={`From: ${message.headers.from}. Date: ${new Date(
                        message.headers.date,
                      ).toLocaleString()}.`}
                    >
                      <div className="flex max-w-[500px] items-center justify-between">
                        <div>
                          <div className="text-gray-900">
                            {message.headers.subject}
                          </div>
                          <div className="text-gray-500">{message.snippet}</div>
                        </div>
                        {openInGmailButton}
                      </div>
                    </Tooltip>
                  ) : (
                    <div className="flex items-center">
                      <span>Message ID: {h.messageId}</span>
                      {openInGmailButton}
                    </div>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <PlanBadge plan={h} />
                </TableCell>
                <TableCell className="space-x-2">
                  {h.actionItems
                    .map((action) => capitalCase(action.type))
                    .join(", ")}
                </TableCell>
                <TableCell className="space-y-4">
                  {Object.entries(getActionFields(h.actionItems?.[0])).map(
                    ([key, value]: [string, any]) => {
                      return (
                        <div key={key}>
                          <strong>{capitalCase(key)}:</strong>{" "}
                          <span className="whitespace-normal">{value}</span>
                        </div>
                      );
                    },
                  )}
                </TableCell>
                <TableCell>
                  {h.automated ? (
                    <Badge color="green">Automated</Badge>
                  ) : (
                    <Badge color="yellow">Manual</Badge>
                  )}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  <Tooltip content={new Date(h.createdAt).toLocaleString()}>
                    <EmailDate date={new Date(h.createdAt)} />
                  </Tooltip>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {!data?.history?.length && (
        <div className="p-2">
          <AlertBasic
            title="No history"
            description="No AI automations have been run yet."
          />
        </div>
      )}
    </LoadingContent>
  );
}
