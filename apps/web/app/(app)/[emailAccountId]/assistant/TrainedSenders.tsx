"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";
import { TrashIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import type { TrainedSendersResponse } from "@/app/api/user/trained-senders/route";
import { ActionType, GroupItemSource } from "@/generated/prisma/enums";
import { useRules } from "@/hooks/useRules";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  forgetTrainedSenderAction,
  moveTrainedSenderAction,
} from "@/utils/actions/trained-senders";
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
import { TablePagination } from "@/components/TablePagination";
import { MutedText } from "@/components/Typography";
import { toastError, toastSuccess } from "@/components/Toast";
import { Tooltip } from "@/components/Tooltip";

type TrainedSender = TrainedSendersResponse["senders"][number];
type RuleOption = { id: string; name: string; label: string | null };

const NO_RULE = "__none__";

export function TrainedSenders() {
  const [page, setPage] = useQueryState("page", parseAsInteger.withDefault(1));
  const [query, setQuery] = useQueryState("q", parseAsString.withDefault(""));
  const [draft, setDraft] = useState(query);

  // Debounce typing into the URL so each keystroke doesn't refetch.
  useEffect(() => {
    if (draft === query) return;
    const id = window.setTimeout(() => {
      setQuery(draft || null);
      setPage(null);
    }, 300);
    return () => window.clearTimeout(id);
  }, [draft, query, setQuery, setPage]);

  const { data, isLoading, error, mutate } = useSWR<TrainedSendersResponse>(
    `/api/user/trained-senders?page=${page}&q=${encodeURIComponent(query)}`,
  );
  const { data: rules } = useRules();

  const ruleOptions = useMemo<RuleOption[]>(
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

  const senders = data?.senders ?? [];

  return (
    <>
      <div className="flex items-center gap-2">
        <Input
          type="search"
          placeholder="Filter by sender"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="max-w-sm"
          aria-label="Filter trained senders"
        />
        {data && (
          <MutedText>
            {data.total} sender{data.total === 1 ? "" : "s"}
          </MutedText>
        )}
      </div>

      <Card className="mt-2">
        <LoadingContent
          loading={isLoading}
          error={error}
          loadingComponent={<Skeleton className="m-4 h-32 rounded" />}
        >
          {senders.length ? (
            <>
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
                        key={sender.sender}
                        sender={sender}
                        ruleOptions={ruleOptions}
                        mutate={mutate}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
              <TablePagination totalPages={data?.totalPages ?? 1} />
            </>
          ) : (
            <AlertBasic
              title={query ? "No senders match" : "No trained senders yet"}
              description={
                query
                  ? "Try a different filter."
                  : "Move an email to a label, or let a rule learn a sender, and it will show up here."
              }
            />
          )}
        </LoadingContent>
      </Card>
    </>
  );
}

function TrainedSenderRow({
  sender,
  ruleOptions,
  mutate,
}: {
  sender: TrainedSender;
  ruleOptions: RuleOption[];
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

  const { execute: forget, isExecuting: isForgetting } = useAction(
    forgetTrainedSenderAction.bind(null, emailAccountId),
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

  const busy = isMoving || isForgetting;
  const current = sender.trainedInto[0];
  const others = sender.trainedInto.slice(1);

  // A disabled rule is not offered as a target; keep the current one
  // selectable so the value still renders.
  const options =
    current && !ruleOptions.some((r) => r.id === current.id)
      ? [
          ...ruleOptions,
          { id: current.id, name: `${current.name} (disabled)`, label: null },
        ]
      : ruleOptions;

  return (
    <TableRow>
      <TableCell className="break-all font-medium">{sender.sender}</TableCell>
      <TableCell>
        <Select
          value={current?.id ?? NO_RULE}
          onValueChange={(ruleId) => {
            if (ruleId !== NO_RULE) move({ sender: sender.sender, ruleId });
          }}
          disabled={busy}
        >
          <SelectTrigger
            className="w-56"
            aria-label={`Rule for ${sender.sender}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {!current && (
              <SelectItem value={NO_RULE} disabled>
                Not trained
              </SelectItem>
            )}
            {options.map((rule) => (
              <SelectItem key={rule.id} value={rule.id}>
                {rule.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {others.length > 0 && (
          <Tooltip content={others.map((r) => r.name).join(", ")}>
            <MutedText className="mt-1 text-xs">
              also in {others.length} more — picking a rule keeps only that one
            </MutedText>
          </Tooltip>
        )}
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1">
          {current?.label ? (
            <Badge variant="secondary">{current.label}</Badge>
          ) : current ? (
            <MutedText>No label action</MutedText>
          ) : null}
          {sender.excludedFrom.length > 0 && (
            <Tooltip
              content={`Never matches: ${sender.excludedFrom
                .map((r) => r.name)
                .join(", ")}`}
            >
              <Badge variant="destructive">
                Excluded from {sender.excludedFrom.length}
              </Badge>
            </Tooltip>
          )}
        </div>
      </TableCell>
      <TableCell>
        <MutedText>{describeSource(sender)}</MutedText>
      </TableCell>
      <TableCell>
        <MutedText className="whitespace-nowrap">
          {sender.createdAt ? formatShortDate(new Date(sender.createdAt)) : "—"}
        </MutedText>
      </TableCell>
      <TableCell className="text-right">
        {current && (
          <Tooltip content="Forget this sender (exclusions are kept)">
            <Button
              variant="outline"
              size="icon"
              aria-label={`Forget ${sender.sender}`}
              disabled={busy}
              onClick={() => forget({ sender: sender.sender })}
            >
              <TrashIcon className="size-4" />
            </Button>
          </Tooltip>
        )}
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
