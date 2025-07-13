"use client";

import { useCallback, useState } from "react";
import { useQueryState, parseAsInteger, parseAsString } from "nuqs";
import useSWR from "swr";
import { Loader2Icon } from "lucide-react";
import { LoadingContent } from "@/components/LoadingContent";
import type { PendingExecutedRules } from "@/app/api/user/planned/route";
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
import { AlertBasic } from "@/components/Alert";
import { approvePlanAction, rejectPlanAction } from "@/utils/actions/ai-rule";
import { toastError } from "@/components/Toast";
import type { ParsedMessage } from "@/utils/types";
import {
  ActionItemsCell,
  EmailCell,
  RuleCell,
} from "@/app/(app)/[emailAccountId]/assistant/ExecutedRulesTable";
import { TablePagination } from "@/components/TablePagination";
import { Checkbox } from "@/components/Checkbox";
import { useToggleSelect } from "@/hooks/useToggleSelect";
import { RulesSelect } from "@/app/(app)/[emailAccountId]/assistant/RulesSelect";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useChat } from "@/components/assistant-chat/ChatContext";

export function Pending() {
  const [page] = useQueryState("page", parseAsInteger.withDefault(1));
  const [ruleId] = useQueryState("ruleId", parseAsString.withDefault("all"));

  const { data, isLoading, error, mutate } = useSWR<PendingExecutedRules>(
    `/api/user/planned?page=${page}&ruleId=${ruleId}`,
  );

  return (
    <>
      <RulesSelect />
      <Card className="mt-2">
        <LoadingContent loading={isLoading} error={error}>
          {data?.executedRules.length ? (
            <PendingTable
              pending={data.executedRules}
              totalPages={data.totalPages}
              mutate={mutate}
            />
          ) : (
            <AlertBasic title="No pending actions" description="" />
          )}
        </LoadingContent>
      </Card>
    </>
  );
}

function PendingTable({
  pending,
  totalPages,
  mutate,
}: {
  pending: PendingExecutedRules["executedRules"];
  totalPages: number;
  mutate: () => void;
}) {
  const { emailAccountId, userEmail } = useAccount();
  const { selected, isAllSelected, onToggleSelect, onToggleSelectAll } =
    useToggleSelect(pending);

  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  const approveSelected = useCallback(async () => {
    setIsApproving(true);
    for (const id of Array.from(selected.keys())) {
      const p = pending.find((p) => p.id === id);
      if (!p) continue;
      const result = await approvePlanAction(emailAccountId, {
        executedRuleId: id,
        message: p.message,
      });
      if (result?.serverError) {
        toastError({
          description: `Unable to execute plan. ${result.serverError}` || "",
        });
      }
      mutate();
    }
    setIsApproving(false);
  }, [selected, pending, mutate, emailAccountId]);
  const rejectSelected = useCallback(async () => {
    setIsRejecting(true);
    for (const id of Array.from(selected.keys())) {
      const p = pending.find((p) => p.id === id);
      if (!p) continue;
      const result = await rejectPlanAction(emailAccountId, {
        executedRuleId: id,
      });
      if (result?.serverError) {
        toastError({
          description: `Error rejecting action. ${result.serverError}` || "",
        });
      }
      mutate();
    }
    setIsRejecting(false);
  }, [selected, pending, mutate, emailAccountId]);

  const { setInput } = useChat();

  return (
    <div>
      {Array.from(selected.values()).filter(Boolean).length > 0 && (
        <div className="m-2 flex items-center space-x-1.5">
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={approveSelected}
              disabled={isApproving || isRejecting}
              loading={isApproving}
            >
              Approve
            </Button>
          </div>
          <div>
            <Button
              size="sm"
              variant="outline"
              onClick={rejectSelected}
              disabled={isApproving || isRejecting}
              loading={isRejecting}
            >
              Reject
            </Button>
          </div>
        </div>
      )}

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <Checkbox checked={isAllSelected} onChange={onToggleSelectAll} />
            </TableHead>
            <TableHead>Email</TableHead>
            <TableHead>Rule</TableHead>
            <TableHead>Actions</TableHead>
            <TableHead />
            {/* <TableHead /> */}
          </TableRow>
        </TableHeader>
        <TableBody>
          {pending.map((p) => (
            <TableRow key={p.id}>
              <TableCell>
                {(isApproving || isRejecting) && selected.get(p.id) ? (
                  <Loader2Icon className="h-4 w-4 animate-spin" />
                ) : (
                  <Checkbox
                    checked={selected.get(p.id) || false}
                    onChange={() => onToggleSelect(p.id)}
                  />
                )}
              </TableCell>
              <TableCell>
                <EmailCell
                  from={p.message.headers.from}
                  subject={p.message.headers.subject}
                  snippet={p.message.snippet}
                  threadId={p.message.threadId}
                  messageId={p.message.id}
                  userEmail={userEmail}
                  createdAt={p.createdAt}
                />
              </TableCell>
              <TableCell>
                <RuleCell
                  emailAccountId={emailAccountId}
                  rule={p.rule}
                  status={p.status}
                  reason={p.reason}
                  message={p.message}
                  setInput={setInput}
                />
              </TableCell>
              <TableCell>
                <ActionItemsCell actionItems={p.actionItems} />
              </TableCell>
              <TableCell>
                <ExecuteButtons id={p.id} message={p.message} mutate={mutate} />
              </TableCell>
              {/* <TableCell>
              <DateCell createdAt={p.createdAt} />
            </TableCell> */}
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <TablePagination totalPages={totalPages} />
    </div>
  );
}

function ExecuteButtons({
  id,
  message,
  mutate,
}: {
  id: string;
  message: ParsedMessage;
  mutate: () => void;
}) {
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const { emailAccountId } = useAccount();

  return (
    <div className="flex items-center justify-end space-x-2 font-medium">
      <Button
        variant="default"
        onClick={async () => {
          setIsApproving(true);
          const result = await approvePlanAction(emailAccountId, {
            executedRuleId: id,
            message,
          });
          if (result?.serverError) {
            toastError({
              description:
                `Error approving action. ${result.serverError}` || "",
            });
          }
          mutate();

          setIsApproving(false);
        }}
        disabled={isApproving || isRejecting}
        loading={isApproving}
      >
        Approve
      </Button>
      <Button
        variant="outline"
        onClick={async () => {
          setIsRejecting(true);
          const result = await rejectPlanAction(emailAccountId, {
            executedRuleId: id,
          });
          if (result?.serverError) {
            toastError({
              description:
                `Error rejecting action. ${result.serverError}` || "",
            });
          }
          mutate();
          setIsRejecting(false);
        }}
        disabled={isApproving || isRejecting}
        loading={isRejecting}
      >
        Reject
      </Button>
    </div>
  );
}
