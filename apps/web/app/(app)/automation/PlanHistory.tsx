"use client";

import useSWR from "swr";
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
import { formatShortDate } from "@/utils/date";
import { Tooltip } from "@/components/Tooltip";

export function PlanHistory() {
  const { data, isLoading, error } = useSWR<PlanHistoryResponse>(
    "/api/user/planned/history",
    {
      keepPreviousData: true,
    },
  );

  return (
    <LoadingContent loading={isLoading} error={error}>
      <Table>
        <TableHeader>
          <TableRow>
            {/* TODO change `message id` to `subject` */}
            <TableHead>Message ID</TableHead>
            <TableHead>Rule</TableHead>
            <TableHead>Actions</TableHead>
            <TableHead>Values</TableHead>
            <TableHead>Execution</TableHead>
            <TableHead>Date</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data?.history.map((h) => {
            return (
              <TableRow key={h.id}>
                <TableCell>{h.messageId}</TableCell>
                <TableCell className="whitespace-nowrap">
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
                </TableCell>
                {/* {JSON.stringify(h, null, 2)} */}
                <TableCell className="space-x-2">
                  {h.actions.map((action, i) => {
                    return (
                      <div key={i}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <div>{action}</div>
                            {/* <div className="text-gray-500">{a.args}</div> */}
                          </div>
                          {/* <div className="text-gray-500">{a.createdAt}</div> */}
                        </div>
                      </div>
                    );
                  })}
                </TableCell>
                <TableCell className="space-x-2">
                  {Object.entries(h.data as any).map(
                    ([key, value]: [string, any]) => {
                      return (
                        <span key={key}>
                          {key}: {value}
                        </span>
                      );
                    },
                  )}
                </TableCell>
                <TableCell>{h.automated ? "Automated" : "Manual"}</TableCell>
                <TableCell>
                  <Tooltip content={new Date(h.createdAt).toLocaleString()}>
                    <div>{formatShortDate(new Date(h.createdAt))}</div>
                  </Tooltip>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {!data?.history?.length && (
        <div className="px-6 py-2">
          <AlertBasic
            title="No history"
            description="You have no history of AI automations yet."
          />
        </div>
      )}
    </LoadingContent>
  );
}
