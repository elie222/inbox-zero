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
import { Textarea } from "@/components/ui/textarea";
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

// "Filter messages like this": build a filing rule from one email or a
// bulk selection — match by sender(s)/domain(s)/subject, send matches to a
// folder (or pin the senders to the inbox), optionally say why (becomes the
// rule's AI instructions), and optionally move existing matches too.
export function FilterLikeThisDialog({
  threads,
  onClose,
  refetch,
}: {
  threads: Thread[];
  onClose: () => void;
  refetch: () => void;
}) {
  const { emailAccountId } = useAccount();
  const lastMessage = threads[0]?.messages?.at(-1);
  const senderEmails = [
    ...new Set(
      threads
        .map((thread) =>
          extractEmailAddress(
            thread.messages?.at(-1)?.headers.from ?? "",
          ).toLowerCase(),
        )
        .filter(Boolean),
    ),
  ];
  const senderDomains = [
    ...new Set(
      senderEmails
        .map((email) => email.split("@")[1])
        .filter((domain): domain is string => !!domain),
    ),
  ];
  const single = threads.length === 1;

  const defaults: Record<FilterMatchType, string> = {
    sender: senderEmails.join(", "),
    domain: senderDomains.map((domain) => `@${domain}`).join(", "),
    subject: single ? (lastMessage?.headers.subject ?? "") : "",
  };

  const [matchType, setMatchType] = useState<FilterMatchType>("sender");
  const [value, setValue] = useState(defaults.sender);
  const [why, setWhy] = useState("");
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
        const created = result.data?.merged
          ? `Added to the existing ${result.data.ruleName} rule`
          : "Filter created";
        toastSuccess({
          description: result.data?.backfillQueued
            ? `${created} — existing matches are being moved in the background.`
            : created,
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
          description:
            senderEmails.length === 1
              ? `${senderEmails[0]} will always stay in your inbox`
              : `${senderEmails.length} senders will always stay in your inbox`,
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
    !!trimmedValue &&
    (target === "inbox" ? senderEmails.length > 0 : !!targetLabel);
  const creating = createFilter.isExecuting || keepInInbox.isExecuting;

  const create = () => {
    if (target === "inbox") {
      for (const email of senderEmails) {
        keepInInbox.execute({
          email,
          priority: ContactInboxPriority.ALWAYS,
        });
      }
      return;
    }
    if (!targetLabel) return;
    createFilter.execute({
      matchType,
      value: trimmedValue,
      labelName: targetLabel.name,
      instructions: why.trim() || undefined,
      skipInbox: true,
      applyToExisting: applyTo === "past",
    });
  };

  const valueLabel =
    matchType === "sender"
      ? senderEmails.length > 1
        ? "Sender addresses"
        : "Sender address"
      : matchType === "domain"
        ? senderDomains.length > 1
          ? "Domains"
          : "Domain"
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
              {MATCH_OPTIONS.filter(
                ({ type }) => single || type !== "subject",
              ).map(({ type, label, icon: Icon }) => (
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

          {target !== "inbox" && target && (
            <div>
              <Label htmlFor="filter-why">Tell the AI why (optional)</Label>
              <Textarea
                id="filter-why"
                className="mt-2"
                rows={2}
                placeholder="e.g. Order and shipping notifications belong here, even from new senders"
                value={why}
                onChange={(event) => setWhy(event.target.value)}
              />
              <p className="mt-1 text-sm text-muted-foreground">
                Saved as the rule's AI instructions, so similar mail from other
                senders files here too.
              </p>
            </div>
          )}

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
                    preview?.countable && preview.total !== null
                      ? `${preview.total} existing ${preview.total === 1 ? "email" : "emails"} will be moved here — including any filed in other folders.`
                      : "Existing matches will be moved here, including any filed in other folders."
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
