"use client";

import useSWR from "swr";
import { useSession } from "next-auth/react";
import { LoadingContent } from "@/components/LoadingContent";
import { PlanHistoryResponse } from "@/app/api/user/planned/history/route";
import { AlertBasic } from "@/components/Alert";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ActionItemsCell,
  DateCell,
  EmailCell,
} from "@/app/(app)/automation/ExecutedRulesTable";
import { Badge } from "@/components/Badge";

export function History() {
  const { data, isLoading, error } = useSWR<PlanHistoryResponse>(
    "/api/user/planned/history",
  );
  const session = useSession();

  return (
    <Card>
      <LoadingContent loading={isLoading} error={error}>
        {data?.length ? (
          <HistoryTable
            data={data}
            userEmail={session.data?.user.email || ""}
          />
        ) : (
          <AlertBasic
            title="No history"
            description="No AI automations have been run yet."
          />
        )}
      </LoadingContent>
    </Card>
  );
}

function HistoryTable({
  data,
  userEmail,
}: {
  data: PlanHistoryResponse;
  userEmail: string;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Actions</TableHead>
          <TableHead />
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((p) => (
          <TableRow key={p.id}>
            <TableCell>
              <EmailCell
                from={p.message.headers.from}
                subject={p.message.headers.subject}
                snippet={p.message.snippet}
                messageId={p.message.id}
                userEmail={userEmail}
              />
            </TableCell>
            <TableCell>
              <ActionItemsCell rule={p.rule} actionItems={p.actionItems} />
            </TableCell>
            <TableCell>
              {p.automated ? (
                <Badge color="green">Automated</Badge>
              ) : (
                <Badge color="yellow">Manual</Badge>
              )}
            </TableCell>
            <TableCell>
              <DateCell createdAt={p.createdAt} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
