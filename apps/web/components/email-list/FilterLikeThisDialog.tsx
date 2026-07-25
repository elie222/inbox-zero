"use client";

import { useState } from "react";
import useSWR from "swr";
import { useAction } from "next-safe-action/hooks";
import { AtSignIcon, GlobeIcon, InboxIcon, TypeIcon } from "lucide-react";
import type { Thread } from "@/components/email-list/types";
import type { FilterPreviewResponse } from "@/app/api/mail/filter-preview/route";
import type { FilterMatchType } from "@/utils/actions/mail-filter.validation";
import { createMailFilterAction } from "@/utils/actions/mail-filter";
import { setContactInboxPriorityAction } from "@/utils/actions/contact";
import { ContactInboxPriority } from "@/generated/prisma/enums";
import { useLabels } from "@/hooks/useLabels";
import { useAccount } from "@/providers/EmailAccountProvider";
import { extractEmailAddress } from "@/utils/email";
import { getActionErrorMessage } from "@/utils/error";
import { toastError, toastSuccess } from "@/components/Toast";
import { cn } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const MATCH_OPTIONS: {
  type: FilterMatchType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  { type: "sender", label: "Sender", icon: AtSignIcon },
  { type: "domain", label: "Domain", icon: GlobeIcon },
  { type: "subject", label: "Subject", icon: TypeIcon },
];

// "Filter messages like this": build a filing rule from an email — match by
// sender/domain/subject, send matches to a folder (or pin the sender to the
// inbox), optionally sweeping existing mail too.
export function FilterLikeThisDialog({
  thread,
  onClose,
  refetch,
}: {
  thread: Thread;
  onClose: () => void;
  refetch: () => void;
}) {
  const { emailAccountId } = useAccount();
  const lastMessage = thread.messages?.at(-1);
  const senderEmail = extractEmailAddress(
    lastMessage?.headers.from ?? "",
  ).toLowerCase();
  const senderDomain = senderEmail.split("@")[1] ?? "";

  const defaults: Record<FilterMatchType, string> = {
    sender: senderEmail,
    domain: senderDomain ? `@${senderDomain}` : "",
    subject: lastMessage?.headers.subject ?? "",
  };

  const [matchType, setMatchType] = useState<FilterMatchType>("sender");
  const [value, setValue] = useState(defaults.sender);
  // "inbox" (keep visible, sender-only) or a label id
  const [target, setTarget] = useState<string | null>(null);
  const [applyTo, setApplyTo] = useState<"future" | "past">("future");

  const { userLabels, isLoading: labelsLoading } = useLabels();

  const trimmedValue = value.trim();
  const { data: preview } = useSWR<FilterPreviewResponse>(
    trimmedValue
      ? `/api/mail/filter-preview?matchType=${matchType}&value=${encodeURIComponent(trimmedValue)}`
      : null,
    { keepPreviousData: true },
  );

  const pickMatchType = (type: FilterMatchType) => {
    setMatchType(type);
    setValue(defaults[type]);
    if (type !== "sender" && target === "inbox") setTarget(null);
  };

  const createFilter = useAction(
    createMailFilterAction.bind(null, emailAccountId),
    {
      onSuccess: (result) => {
        toastSuccess({
          description: result.data?.backfillQueued
            ? "Filter created — existing matches are being moved in the background."
            : "Filter created",
        });
        refetch();
        onClose();
      },
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
      },
    },
  );

  const keepInInbox = useAction(
    setContactInboxPriorityAction.bind(null, emailAccountId),
    {
      onSuccess: () => {
        toastSuccess({
          description: `${senderEmail} will always stay in your inbox`,
        });
        onClose();
      },
      onError: (error) => {
        toastError({ description: getActionErrorMessage(error.error) });
      },
    },
  );

  const targetLabel = userLabels.find((label) => label.id === target);
  const canCreate =
    !!trimmedValue && (target === "inbox" ? !!senderEmail : !!targetLabel);
  const creating = createFilter.isExecuting || keepInInbox.isExecuting;

  const create = () => {
    if (target === "inbox") {
      keepInInbox.execute({
        email: senderEmail,
        priority: ContactInboxPriority.ALWAYS,
      });
      return;
    }
    if (!targetLabel) return;
    createFilter.execute({
      matchType,
      value: trimmedValue,
      labelName: targetLabel.name,
      skipInbox: true,
      applyToExisting: applyTo === "past",
    });
  };

  const valueLabel =
    matchType === "sender"
      ? "Sender address"
      : matchType === "domain"
        ? "Domain"
        : "Subject contains";

  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Filter messages like this</DialogTitle>
          <DialogDescription>
            Build a rule that auto-routes matching mail into one of your
            folders.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70">
              Match by
            </h3>
            <div className="grid grid-cols-3 gap-2">
              {MATCH_OPTIONS.map(({ type, label, icon: Icon }) => (
                <button
                  key={type}
                  type="button"
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm",
                    matchType === type
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border text-muted-foreground hover:border-muted-foreground/40",
                  )}
                  onClick={() => pickMatchType(type)}
                >
                  <Icon className="size-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="filter-value">{valueLabel}</Label>
            <Input
              id="filter-value"
              className="mt-2"
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
            <p className="mt-1 text-sm text-muted-foreground">
              {preview?.countable
                ? `About ${preview.total} existing ${preview.total === 1 ? "email matches" : "emails match"}.`
                : matchType === "subject"
                  ? "Matches subject lines containing this text."
                  : " "}
            </p>
          </div>

          <div>
            <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70">
              Send to
            </h3>
            <div className="max-h-64 divide-y divide-border overflow-y-auto rounded-lg border border-border">
              {matchType === "sender" && (
                <TargetRow
                  selected={target === "inbox"}
                  onClick={() => setTarget("inbox")}
                  tag="Keep visible"
                >
                  <InboxIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate text-sm font-medium">
                    Inbox — always show
                  </span>
                </TargetRow>
              )}
              {userLabels.map((label) => (
                <TargetRow
                  key={label.id}
                  selected={target === label.id}
                  onClick={() => setTarget(label.id)}
                  tag={
                    lastMessage?.labelIds?.includes(label.id)
                      ? "Current"
                      : undefined
                  }
                >
                  <span
                    className="size-2.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor:
                        label.color?.backgroundColor ?? "var(--muted)",
                    }}
                  />
                  <span className="truncate text-sm">{label.name}</span>
                </TargetRow>
              ))}
              {!userLabels.length && !labelsLoading && (
                <p className="px-3 py-4 text-sm text-muted-foreground">
                  No folders yet — create one from the sidebar first.
                </p>
              )}
            </div>
          </div>

          {target !== "inbox" && (
            <div>
              <h3 className="mb-2 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70">
                Apply to
              </h3>
              <div className="space-y-2">
                <ApplyOption
                  selected={applyTo === "future"}
                  onClick={() => setApplyTo("future")}
                  title="Future emails only"
                />
                <ApplyOption
                  selected={applyTo === "past"}
                  onClick={() => setApplyTo("past")}
                  title="Future and past matches"
                  description={
                    preview?.countable && preview.inbox !== null
                      ? `${preview.inbox} existing ${preview.inbox === 1 ? "email" : "emails"} will be moved.`
                      : "Existing matches in your inbox will be moved."
                  }
                />
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button disabled={!canCreate} loading={creating} onClick={create}>
              Create filter
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function TargetRow({
  selected,
  onClick,
  tag,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  tag?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/50",
        selected && "bg-primary/10",
      )}
      onClick={onClick}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">{children}</div>
      {tag && (
        <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.15em] text-muted-foreground/70">
          {tag}
        </span>
      )}
    </button>
  );
}

function ApplyOption({
  selected,
  onClick,
  title,
  description,
}: {
  selected: boolean;
  onClick: () => void;
  title: string;
  description?: string;
}) {
  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-start gap-3 rounded-lg border px-3 py-3 text-left",
        selected
          ? "border-primary"
          : "border-border hover:border-muted-foreground/40",
      )}
      onClick={onClick}
    >
      <span
        className={cn(
          "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
          selected ? "border-primary" : "border-muted-foreground/40",
        )}
      >
        {selected && <span className="size-2.5 rounded-full bg-primary" />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-medium">{title}</span>
        {description && (
          <span className="block text-sm text-muted-foreground">
            {description}
          </span>
        )}
      </span>
    </button>
  );
}
