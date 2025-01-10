"use client";

import useSWR from "swr";
import { useQueryState, parseAsInteger, parseAsString } from "nuqs";
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
} from "@/app/(app)/automation/ExecutedRulesTable";
import { TablePagination } from "@/components/TablePagination";
import { Badge } from "@/components/Badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRules } from "@/hooks/useRules";
import { Skeleton } from "@/components/ui/skeleton";

export function History() {
  const [page] = useQueryState("page", parseAsInteger.withDefault(1));
  const [ruleId, setRuleId] = useQueryState(
    "ruleId",
    parseAsString.withDefault("all"),
  );

  const { data, isLoading, error } = useSWR<PlanHistoryResponse>(
    `/api/user/planned/history?page=${page}&ruleId=${ruleId}`,
  );
  const session = useSession();

  const {
    data: rules,
    isLoading: rulesLoading,
    error: rulesError,
  } = useRules();

  return (
    <>
      <div className="flex">
        <LoadingContent
          loading={rulesLoading}
          error={rulesError}
          loadingComponent={<Skeleton className="h-10 w-32" />}
        >
          <div>
            <Select
              defaultValue={ruleId}
              onValueChange={(value) => setRuleId(value)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Filter by rule" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All rules</SelectItem>
                {rules?.map((rule) => (
                  <SelectItem key={rule.id} value={rule.id}>
                    {rule.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </LoadingContent>
      </div>
      <Card className="mt-2">
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
              description={
                ruleId === "all"
                  ? "No emails have been processed yet."
                  : "No emails have been processed for this rule."
              }
            />
          )}
        </LoadingContent>
      </Card>
    </>
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
                <RuleCell
                  rule={p.rule}
                  reason={p.reason}
                  message={p.message}
                  isTest={false}
                />
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
