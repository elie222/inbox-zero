"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import { parseAsInteger, parseAsString, useQueryState } from "nuqs";
import { TrashIcon } from "lucide-react";
import { useAction } from "next-safe-action/hooks";
import type { TrainedSendersResponse } from "@/app/api/user/trained-senders/route";
import type { RulesResponse } from "@/app/api/user/rules/route";
import { ActionType, GroupItemSource } from "@/generated/prisma/enums";
import { useRules } from "@/hooks/useRules";
import { useAccount } from "@/providers/EmailAccountProvider";
import {
  forgetTrainedSenderAction,
  keepSenderInInboxAction,
  moveTrainedSenderAction,
  trainSenderToDeleteAction,
} from "@/utils/actions/trained-senders";
import { isDeleteEmailActionEnabled } from "@/utils/delete-email-action";
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
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
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
export type RuleOption = { id: string; name: string; label: string | null };

// Picker values that are not rules.
const INBOX = "__inbox__";
const DELETE = "__delete__";
const NONE = "__none__";

// `emailAccountId` lets a page outside the account route (the organization
// view) render one of these per mailbox.
// ponytail: page/q live in the URL, so stacked instances page together.
export function TrainedSenders({
  emailAccountId,
}: {
  emailAccountId?: string;
}) {
  const { emailAccountId: contextId } = useAccount();
  const accountId = emailAccountId ?? contextId;
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

  const { data, isLoading, error, mutate } = useSWR<TrainedSendersResponse>([
    `/api/user/trained-senders?page=${page}&q=${encodeURIComponent(query)}`,
    accountId,
  ]);
  const { data: rules } = useRules(accountId);

  const ruleOptions = useMemo(() => toRuleOptions(rules), [rules]);

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
            {data.total} sender{data.total === 1 ? "" : "s"} total ·{" "}
            {data.unsubscribed} unsubscribed
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
                        emailAccountId={accountId}
                        mutate={mutate}
                      />
                    ))}
                  </TableBody>
                </Table>
              </div>
              <PageNumbers
                page={page}
                totalPages={data?.totalPages ?? 1}
                onChange={(next) => setPage(next === 1 ? null : next)}
              />
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

// Delete-only rules are represented by the "Delete" entry instead.
export function toRuleOptions(rules: RulesResponse | undefined): RuleOption[] {
  return (rules ?? [])
    .filter(
      (rule) =>
        rule.enabled &&
        !(
          rule.actions.length > 0 &&
          rule.actions.every((a) => a.type === ActionType.DELETE)
        ),
    )
    .map((rule) => ({
      id: rule.id,
      name: rule.name,
      label:
        rule.actions.find((action) => action.type === ActionType.LABEL)
          ?.label ?? null,
    }));
}

export function TrainedSenderRow({
  sender,
  ruleOptions,
  emailAccountId,
  mailbox,
  mutate,
}: {
  sender: TrainedSender;
  ruleOptions: RuleOption[];
  emailAccountId: string;
  mailbox?: string;
  mutate: () => void;
}) {
  const deleteEnabled = isDeleteEmailActionEnabled();

  const feedback = (done: string) => ({
    onSuccess: () => {
      toastSuccess({ description: `${done} ${sender.sender}` });
      mutate();
    },
    onError: (error: {
      error: Parameters<typeof getActionErrorMessage>[0];
    }) => {
      toastError({ description: getActionErrorMessage(error.error) });
    },
  });

  const move = useAction(
    moveTrainedSenderAction.bind(null, emailAccountId),
    feedback("Moved"),
  );
  const forget = useAction(
    forgetTrainedSenderAction.bind(null, emailAccountId),
    feedback("Forgot"),
  );
  const keep = useAction(
    keepSenderInInboxAction.bind(null, emailAccountId),
    feedback("Keeping in inbox:"),
  );
  const trash = useAction(
    trainSenderToDeleteAction.bind(null, emailAccountId),
    feedback("Deleting future mail from"),
  );

  const busy =
    move.isExecuting ||
    forget.isExecuting ||
    keep.isExecuting ||
    trash.isExecuting;

  const current = sender.trainedInto[0];
  const others = sender.trainedInto.slice(1);
  // Exclusions only matter when nothing files this sender: it is being kept
  // in the inbox on purpose. Once it is trained into a rule, leftover
  // exclusions from earlier corrections are just noise.
  const keptInInbox = !current && sender.excludedFrom.length > 0;

  const value = current
    ? current.deletes
      ? DELETE
      : current.id
    : keptInInbox
      ? INBOX
      : NONE;

  // A disabled rule is not offered as a target; keep the current one
  // selectable so the value still renders.
  const options =
    current && !current.deletes && !ruleOptions.some((r) => r.id === current.id)
      ? [
          ...ruleOptions,
          { id: current.id, name: `${current.name} (disabled)`, label: null },
        ]
      : ruleOptions;

  const onPick = (picked: string) => {
    if (picked === value) return;
    if (picked === INBOX) keep.execute({ sender: sender.sender });
    else if (picked === DELETE) trash.execute({ sender: sender.sender });
    else if (picked !== NONE)
      move.execute({ sender: sender.sender, ruleId: picked });
  };

  return (
    <TableRow>
      <TableCell className="break-all font-medium">
        {sender.sender}
        {mailbox && (
          <MutedText className="text-xs font-normal">{mailbox}</MutedText>
        )}
      </TableCell>
      <TableCell>
        <Select value={value} onValueChange={onPick} disabled={busy}>
          <SelectTrigger
            className="w-56"
            aria-label={`Rule for ${sender.sender}`}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {value === NONE && (
              <SelectItem value={NONE} disabled>
                Not trained
              </SelectItem>
            )}
            <SelectItem value={INBOX}>Inbox</SelectItem>
            <SelectSeparator />
            {options.map((rule) => (
              <SelectItem key={rule.id} value={rule.id}>
                {rule.name}
              </SelectItem>
            ))}
            {(deleteEnabled || value === DELETE) && (
              <>
                <SelectSeparator />
                <SelectItem value={DELETE}>Delete</SelectItem>
              </>
            )}
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
        {current?.deletes ? (
          <Tooltip content="Future emails from this sender go to the trash.">
            <Badge variant="destructive">Trash</Badge>
          </Tooltip>
        ) : current?.label ? (
          <Badge variant="secondary">{current.label}</Badge>
        ) : current ? (
          <MutedText>No label action</MutedText>
        ) : keptInInbox ? (
          <Tooltip
            content={`Never filed by: ${sender.excludedFrom
              .map((r) => r.name)
              .join(", ")}`}
          >
            <Badge variant="outline">Kept in inbox</Badge>
          </Tooltip>
        ) : null}
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
          <Tooltip content="Forget this sender">
            <Button
              variant="outline"
              size="icon"
              aria-label={`Forget ${sender.sender}`}
              disabled={busy}
              onClick={() => forget.execute({ sender: sender.sender })}
            >
              <TrashIcon className="size-4" />
            </Button>
          </Tooltip>
        )}
      </TableCell>
    </TableRow>
  );
}

export function PageNumbers({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;

  const go = (next: number) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (next >= 1 && next <= totalPages && next !== page) onChange(next);
  };

  return (
    <div className="m-4">
      <Pagination className="justify-end">
        <PaginationContent>
          {page > 1 && (
            <PaginationItem>
              <PaginationPrevious href="#" onClick={go(page - 1)} />
            </PaginationItem>
          )}
          {pageWindow(page, totalPages).map((entry, index) =>
            entry === "…" ? (
              <PaginationItem key={`gap-${index}`}>
                <PaginationEllipsis />
              </PaginationItem>
            ) : (
              <PaginationItem key={entry}>
                <PaginationLink
                  href="#"
                  isActive={entry === page}
                  onClick={go(entry)}
                >
                  {entry}
                </PaginationLink>
              </PaginationItem>
            ),
          )}
          {page < totalPages && (
            <PaginationItem>
              <PaginationNext href="#" onClick={go(page + 1)} />
            </PaginationItem>
          )}
        </PaginationContent>
      </Pagination>
    </div>
  );
}

// Every page up to 9; beyond that the first, last and a window around the
// current page, with gaps.
function pageWindow(page: number, totalPages: number): (number | "…")[] {
  if (totalPages <= 9) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, totalPages]);
  for (let p = page - 2; p <= page + 2; p++) {
    if (p >= 1 && p <= totalPages) pages.add(p);
  }
  const sorted = [...pages].sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  for (const [index, p] of sorted.entries()) {
    if (index > 0 && p - (sorted[index - 1] as number) > 1) out.push("…");
    out.push(p);
  }
  return out;
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
