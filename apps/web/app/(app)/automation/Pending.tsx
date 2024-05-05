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
import { Button, ButtonLoader } from "@/components/ui/button";
import { decodeSnippet } from "@/utils/gmail/decode";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AlertBasic } from "@/components/Alert";
import { ActionBadgeExpanded } from "@/components/PlanBadge";
import { approvePlanAction, rejectPlanAction } from "@/utils/actions/ai-rule";
import { toastError } from "@/components/Toast";
import { useState } from "react";

export function Pending() {
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
        {data?.length ? (
          <PendingTable pending={data} mutate={mutate} />
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
  mutate,
}: {
  pending: PendingExecutedRules;
  mutate: () => void;
}) {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Email</TableHead>
          <TableHead>Actions</TableHead>
          <TableHead />
        </TableRow>
      </TableHeader>
      <TableBody>
        {pending.map((p) => (
          <PendingRow key={p.id} {...p} mutate={mutate} />
        ))}
      </TableBody>
    </Table>
  );
}

function PendingRow(
  props: PendingExecutedRules[number] & { mutate: () => void },
) {
  const { id, message, rule, actionItems, mutate } = props;
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);

  return (
    <TableRow key={id}>
      <TableCell>
        <div className="flex items-center gap-4">
          <Avatar>
            <AvatarFallback>
              {message.headers.from.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex flex-col justify-center">
            <div className="font-semibold">{message.headers.from}</div>
            <div className="mt-1 font-medium">{message.headers.subject}</div>
            <div className="mt-1 text-muted-foreground">
              {decodeSnippet(message.snippet)}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>
        <div>
          <div className="font-medium">{rule?.name}</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {actionItems.map((item) => (
              <ActionBadgeExpanded key={item.id} action={item} />
            ))}
          </div>
        </div>
      </TableCell>
      <TableCell>
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
      </TableCell>
    </TableRow>
  );
}
