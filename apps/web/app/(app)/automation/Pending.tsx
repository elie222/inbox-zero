"use client";

import { useState } from "react";
import useSWR from "swr";
import { useSession } from "next-auth/react";
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
import { Button, ButtonLoader } from "@/components/ui/button";
import { AlertBasic } from "@/components/Alert";
import { approvePlanAction, rejectPlanAction } from "@/utils/actions/ai-rule";
import { toastError } from "@/components/Toast";
import { ParsedMessage } from "@/utils/types";
import {
  ActionItemsCell,
  EmailCell,
  RuleCell,
  TablePagination,
  // DateCell,
} from "@/app/(app)/automation/ExecutedRulesTable";
import { useSearchParams } from "next/navigation";

export function Pending() {
  const searchParams = useSearchParams();
  const page = parseInt(searchParams.get("page") || "1");
  const { data, isLoading, error, mutate } = useSWR<PendingExecutedRules>(
    `/api/user/planned?page=${page}`,
  );

  const session = useSession();

  return (
    <Card>
      <LoadingContent loading={isLoading} error={error}>
        {data?.executedRules.length ? (
          <PendingTable
            pending={data.executedRules}
            totalPages={data.totalPages}
            userEmail={session.data?.user.email || ""}
            mutate={mutate}
          />
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

function PendingTable({
  pending,
  totalPages,
  userEmail,
  mutate,
}: {
  pending: PendingExecutedRules["executedRules"];
  totalPages: number;
  userEmail: string;
  mutate: () => void;
}) {
  return (
    <div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Email</TableHead>
            <TableHead>Rule</TableHead>
            <TableHead>Action items</TableHead>
            <TableHead />
            {/* <TableHead /> */}
          </TableRow>
        </TableHeader>
        <TableBody>
          {pending.map((p) => (
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

  return (
    <div className="flex items-center justify-end space-x-2 font-medium">
      <Button
        variant="default"
        onClick={async () => {
          try {
            setIsApproving(true);
            await approvePlanAction(id, message);
            mutate();
          } catch (error) {
            console.error(error);
            toastError({
              description:
                "Error approving action: " + (error as Error).message,
            });
          }
          setIsApproving(false);
        }}
        disabled={isApproving || isRejecting}
      >
        {isApproving && <ButtonLoader />}
        Approve
      </Button>
      <Button
        variant="outline"
        onClick={async () => {
          setIsRejecting(true);
          try {
            await rejectPlanAction(id);
            mutate();
          } catch (error) {
            console.error(error);
            toastError({
              description:
                "Error rejecting action: " + (error as Error).message,
            });
          }
          setIsRejecting(false);
        }}
        disabled={isApproving || isRejecting}
      >
        {isRejecting && <ButtonLoader />}
        Reject
      </Button>
    </div>
  );
}
