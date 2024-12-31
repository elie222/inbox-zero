"use client";

import useSWR from "swr";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import { LoadingContent } from "@/components/LoadingContent";
import type { PlanHistoryResponse } from "@/app/api/user/planned/history/route";
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
  RuleCell,
  TablePagination,
} from "@/app/(app)/automation/ExecutedRulesTable";
import { Badge } from "@/components/Badge";

export function History() {
  const searchParams = useSearchParams();
  const page = searchParams.get("page") || "1";
  const { data, isLoading, error } = useSWR<PlanHistoryResponse>(
    `/api/user/planned/history?page=${page}`,
  );
  const session = useSession();

  return (
    <Card>
      <LoadingContent loading={isLoading} error={error}>
        {data?.executedRules.length ? (
          <HistoryTable
            data={data.executedRules}
            totalPages={data.totalPages}
            userEmail={session.data?.user.email || ""}
          />
        ) : (
          <AlertBasic
            title="No history"
            description="No AI personal assistant actions have been run yet."
          />
        )}
      </LoadingContent>
    </Card>
  );
}

function HistoryTable({
  data,
  totalPages,
  userEmail,
}: {
  data: PlanHistoryResponse["executedRules"];
  totalPages: number;
  userEmail: string;
}) {
  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Rule</TableHead>
            <TableHead>Actions</TableHead>
            <TableHead>Automated</TableHead>
            <TableHead>Date</TableHead>
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
                <RuleCell rule={p.rule} reason={p.reason} />
              </TableCell>
              <TableCell>
                <ActionItemsCell actionItems={p.actionItems} />
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

      <TablePagination totalPages={totalPages} />
    </div>
  );
}
