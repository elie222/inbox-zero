"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { TrashIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import type { TrainedSendersResponse } from "@/app/api/user/trained-senders/route";
import { ActionType, GroupItemSource } from "@/generated/prisma/enums";
import { useRules } from "@/hooks/useRules";
import { useAccount } from "@/providers/EmailAccountProvider";
import { moveTrainedSenderAction } from "@/utils/actions/trained-senders";
import { deleteGroupItemAction } from "@/utils/actions/group";
import { getActionErrorMessage } from "@/utils/error";
import { formatShortDate } from "@/utils/date";
import { LoadingContent } from "@/components/LoadingContent";
import { AlertBasic } from "@/components/Alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MutedText } from "@/components/Typography";
import { toastError, toastSuccess } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";

type TrainedSender = TrainedSendersResponse["senders"][number];

export function TrainedSenders() {
  const { data, isLoading, error, mutate } = useSWR<TrainedSendersResponse>(
    "/api/user/trained-senders",
  );
  const { data: rules } = useRules();
  const [query, setQuery] = useState("");

  const ruleOptions = useMemo(
    () =>
      (rules ?? [])
        .filter((rule) => rule.enabled)
        .map((rule) => ({
          id: rule.id,
          name: rule.name,
          label:
            rule.actions.find((action) => action.type === ActionType.LABEL)
              ?.label ?? null,
        })),
    [rules],
  );

  const senders = useMemo(() => {
    const all = data?.senders ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return all;
    return all.filter(
      (s) =>
        s.sender.toLowerCase().includes(q) ||
        s.rule.name.toLowerCase().includes(q) ||
        (s.rule.label?.toLowerCase().includes(q) ?? false),
    );
  }, [data, query]);

  return (
    <>
      <div className="flex items-center gap-2">
        <Input
          type="search"
          placeholder="Filter by sender, rule, or label"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-sm"
          aria-label="Filter trained senders"
        />
        {data && (
          <MutedText>
            {senders.length} of {data.senders.length}
          </MutedText>
        )}
      </div>

      <Card className="mt-2">
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="m-4 h-32 rounded" />}
        >
          {data?.senders.length ? (
            <TrainedSendersTable
              senders={senders}
              ruleOptions={ruleOptions}
              mutate={mutate}
            />
          ) : (
            <AlertBasic
              title="No trained senders yet"
              description="Move an email to a label, or let a rule learn a sender, and it will show up here."
            />
          )}
        </LoadingContent>
      </Card>
    </>
  );
}

function TrainedSendersTable({
  senders,
  ruleOptions,
  mutate,
}: {
  senders: TrainedSender[];
  ruleOptions: { id: string; name: string; label: string | null }[];
  mutate: () => void;
}) {
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Sender</TableHead>
            <TableHead>Rule</TableHead>
            <TableHead>Label</TableHead>
            <TableHead>Learned from</TableHead>
            <TableHead>Added</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {senders.map((sender) => (
            <TrainedSenderRow
              key={sender.id}
              sender={sender}
              ruleOptions={ruleOptions}
              mutate={mutate}
            />
          ))}
          {senders.length === 0 && (
            <TableRow>
              <TableCell colSpan={6}>
                <MutedText>No senders match your filter</MutedText>
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}

function TrainedSenderRow({
  sender,
  ruleOptions,
  mutate,
}: {
  sender: TrainedSender;
  ruleOptions: { id: string; name: string; label: string | null }[];
  mutate: () => void;
}) {
  const { emailAccountId } = useAccount();

  const { execute: move, isExecuting: isMoving } = useAction(
    moveTrainedSenderAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: `Moved ${sender.sender}` });
        mutate();
      },
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
      },
    },
  );

  const { execute: remove, isExecuting: isRemoving } = useAction(
    deleteGroupItemAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({ description: `Forgot ${sender.sender}` });
        mutate();
      },
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
      },
    },
  );

  // A disabled rule is not in the options; keep it selectable so the
  // current value still renders.
  const options = ruleOptions.some((r) => r.id === sender.rule.id)
    ? ruleOptions
    : [
        ...ruleOptions,
        {
          id: sender.rule.id,
          name: `${sender.rule.name} (disabled)`,
          label: sender.rule.label,
        },
      ];

  return (
    <TableRow>
      <TableCell className="break-all font-medium">{sender.sender}</TableCell>
      <TableCell>
        <Select
          value={sender.rule.id}
          onValueChange={(ruleId) => move({ itemId: sender.id, ruleId })}
          disabled={isMoving || isRemoving}
        >
          <SelectTrigger
            className="w-56"
            aria-label={`Rule for ${sender.sender}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {options.map((rule) => (
              <SelectItem key={rule.id} value={rule.id}>
                {rule.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </TableCell>
      <TableCell>
        {sender.exclude ? (
          <Tooltip content="This sender is excluded from the rule; it never matches.">
            <Badge variant="destructive">Excluded</Badge>
          </Tooltip>
        ) : sender.rule.label ? (
          <Badge variant="secondary">{sender.rule.label}</Badge>
        ) : (
          <MutedText>No label action</MutedText>
        )}
      </TableCell>
      <TableCell>
        <MutedText>{describeSource(sender)}</MutedText>
      </TableCell>
      <TableCell>
        <MutedText className="whitespace-nowrap">
          {formatShortDate(new Date(sender.createdAt))}
        </MutedText>
      </TableCell>
      <TableCell className="text-right">
        <Tooltip content="Forget this sender">
          <Button
            variant="outline"
            size="icon"
            aria-label={`Forget ${sender.sender}`}
            disabled={isMoving || isRemoving}
            onClick={() => remove({ id: sender.id })}
          >
            <TrashIcon className="size-4" />
          </Button>
        </Tooltip>
      </TableCell>
    </TableRow>
  );
}

function describeSource(sender: TrainedSender) {
  switch (sender.source) {
    case GroupItemSource.LABEL_ADDED:
      return "You moved an email";
    case GroupItemSource.LABEL_REMOVED:
      return "You removed the label";
    case GroupItemSource.USER:
      return sender.reason ?? "Added by you";
    case GroupItemSource.AI:
      return "AI";
    default:
      return sender.reason ?? "—";
  }
}
