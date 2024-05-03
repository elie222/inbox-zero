"use client";

import useSWR from "swr";
import { LoadingContent } from "@/components/LoadingContent";
import { PendingExecutedRules } from "@/app/api/user/planned/route";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { decodeSnippet } from "@/utils/gmail/decode";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AlertBasic } from "@/components/Alert";
import { ActionType, ExecutedAction } from "@prisma/client";
import { truncate } from "@/utils/string";
import { Badge } from "@/components/Badge";
import {
  ActionBadge,
  ActionBadgeExpanded,
  getActionColor,
} from "@/components/PlanBadge";

export function Planned() {
  const { data, isLoading, error, mutate } = useSWR<PendingExecutedRules>(
    "/api/user/planned",
    {
      keepPreviousData: true,
      dedupingInterval: 1_000,
    },
  );

  return (
    <Card>
      <LoadingContent loading={isLoading} error={error}>
        {data ? (
          <PlannedTable pending={data} />
        ) : (
          <AlertBasic
            title="No pending actions"
            description="Set automations for our AI to handle incoming emails for you."
          />
        )}
      </LoadingContent>
    </Card>
  );
}

function PlannedTable({ pending }: { pending: PendingExecutedRules }) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Name</TableHead>
          <TableHead>Actions</TableHead>
          <TableHead></TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {pending.map((p) => {
          return (
            <TableRow key={p.id}>
              <TableCell>
                <div className="flex items-center gap-4">
                  <Avatar>
                    <AvatarFallback>
                      {p.message.headers.from.charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <div className="font-semibold">
                      {p.message.headers.from}
                    </div>
                    <div className="mt-1 font-medium">
                      {p.message.headers.subject}
                    </div>
                    <div className="text-muted-foreground">
                      {decodeSnippet(p.message.snippet)}
                    </div>
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div>
                  <div className="font-medium">{p.rule?.name}</div>
                  <div className="mt-2 flex flex-wrap gap-1">
                    {p.actionItems.map((item) => (
                      <ActionBadgeExpanded key={item.id} action={item} />
                    ))}
                  </div>
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center justify-end space-x-2 font-medium">
                  <Button variant="default">Approve</Button>
                  <Button variant="outline">Reject</Button>
                </div>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
