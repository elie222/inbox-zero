"use client";

import useSWR from "swr";
import { useQueryState, parseAsInteger, parseAsString } from "nuqs";
import { LoadingContent } from "@/components/LoadingContent";
import type { GetExecutedRulesResponse } from "@/app/api/user/planned/history/route";
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
  EmailCell,
  RuleCell,
} from "@/app/(app)/[emailAccountId]/assistant/ExecutedRulesTable";
import { TablePagination } from "@/components/TablePagination";
import { Badge } from "@/components/Badge";
import { RulesSelect } from "@/app/(app)/[emailAccountId]/assistant/RulesSelect";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useChat } from "@/providers/ChatProvider";
import { useExecutedRules } from "@/hooks/useExecutedRules";

export function History() {
  const [page] = useQueryState("page", parseAsInteger.withDefault(1));
  const [ruleId] = useQueryState("ruleId", parseAsString.withDefault("all"));

  const { data, isLoading, error } = useExecutedRules({ page, ruleId });

  return (
    <>
      <RulesSelect />
      <Card className="mt-2">
        <LoadingContent loading={isLoading} error={error}>
          {data?.executedRules.length ? (
            <HistoryTable
              data={data.executedRules}
              totalPages={data.totalPages}
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
}: {
  data: GetExecutedRulesResponse["executedRules"];
  totalPages: number;
}) {
  const { userEmail } = useAccount();
  const { setInput } = useChat();

  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead className="text-right">Rule</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((er) => (
            <TableRow key={er.id}>
              <TableCell>
                <EmailCell
                  from={er.message.headers.from}
                  subject={er.message.headers.subject}
                  snippet={er.message.snippet}
                  threadId={er.message.threadId}
                  messageId={er.message.id}
                  userEmail={userEmail}
                  createdAt={er.createdAt}
                />
                {!er.automated && (
                  <Badge color="yellow" className="mt-2">
                    Applied manually
                  </Badge>
                )}
              </TableCell>
              <TableCell>
                <RuleCell
                  rule={er.rule}
                  executedAt={er.createdAt}
                  status={er.status}
                  reason={er.reason}
                  message={er.message}
                  setInput={setInput}
                />
                {/* <ActionItemsCell actionItems={p.actionItems} /> */}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <TablePagination totalPages={totalPages} />
    </div>
  );
}
