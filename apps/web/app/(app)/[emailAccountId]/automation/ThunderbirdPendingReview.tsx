"use client";

import { useMemo, useState } from "react";
import useSWR from "swr";
import { formatDistanceToNowStrict, isValid, parseISO } from "date-fns";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { LoadingContent } from "@/components/LoadingContent";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useAction } from "next-safe-action/hooks";
import { toastError, toastSuccess } from "@/components/Toast";
import {
  clearThunderbirdReviewAction,
  decideThunderbirdReviewAction,
} from "@/utils/actions/thunderbird-review";
import type { GetThunderbirdReviewResponse } from "@/app/api/user/thunderbird/review/route";
import type { ThunderbirdInboxItem } from "@/utils/redis/thunderbird-inbox";
import type { ThunderbirdBridgeAction } from "@/utils/redis/thunderbird-actions";
import { getActionErrorMessage } from "@/utils/error";
import { cn } from "@/utils";

export function ThunderbirdPendingReview() {
  const { emailAccountId } = useAccount();
  const { data, error, isLoading, mutate } =
    useSWR<GetThunderbirdReviewResponse>("/api/user/thunderbird/review");
  const [draftEdits, setDraftEdits] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);

  const { executeAsync: decide } = useAction(
    decideThunderbirdReviewAction.bind(null, emailAccountId),
  );
  const { executeAsync: clearAll, isExecuting: clearing } = useAction(
    clearThunderbirdReviewAction.bind(null, emailAccountId),
  );

  const items = data?.items || [];
  const pending = useMemo(
    () => items.filter((item) => item.status === "pending"),
    [items],
  );
  const done = useMemo(
    () => items.filter((item) => item.status !== "pending"),
    [items],
  );

  const onDecide = async (
    item: ThunderbirdInboxItem,
    decision: "approve" | "reject" | "delete",
    overrideActions?: ThunderbirdBridgeAction[],
  ) => {
    setBusyId(item.id);
    try {
      let proposedActions = overrideActions || item.proposedActions;
      if (decision === "approve" && !overrideActions) {
        proposedActions = item.proposedActions.map((action) => {
          if (
            (action.type === "draft" || action.type === "reply") &&
            draftEdits[item.id] != null
          ) {
            return { ...action, content: draftEdits[item.id] };
          }
          return action;
        });
      }

      const result = await decide({
        itemId: item.id,
        decision,
        proposedActions: decision === "approve" ? proposedActions : undefined,
      });
      if (result?.serverError || result?.validationErrors) {
        throw new Error(getActionErrorMessage(result));
      }
      toastSuccess({
        description:
          decision === "approve"
            ? "Queued for Thunderbird — the add-on will apply on its next poll."
            : decision === "delete"
              ? "Delete queued — Thunderbird will move it to Trash on the next poll."
              : "Dismissed from the review list.",
      });
      await mutate();
    } catch (err) {
      toastError({
        description: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setBusyId(null);
    }
  };

  const onQuickApply = (
    item: ThunderbirdInboxItem,
    actions: ThunderbirdBridgeAction[],
  ) => onDecide(item, "approve", actions);

  return (
    <LoadingContent loading={isLoading} error={error}>
      <div className="space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-2xl space-y-1">
            <p className="text-sm text-muted-foreground">
              Use quick actions for fast triage (Archive, Label, Delete), or
              Approve the AI suggestion (tag + archive / needs-attention /
              trash). Process more mail from the Thunderbird add-on so Pending
              fills with proposals for the whole recent inbox.
            </p>
            <p className="text-xs text-muted-foreground">
              {pending.length} pending
              {done.length > 0 ? ` · ${done.length} already decided` : ""}
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={clearing || items.length === 0}
            onClick={async () => {
              const result = await clearAll({});
              if (result?.serverError) {
                toastError({ description: getActionErrorMessage(result) });
                return;
              }
              await mutate();
            }}
          >
            Clear list
          </Button>
        </div>

        {pending.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
            Nothing waiting for review. In Thunderbird, open Inbox Zero Bridge →
            <strong> Process recent</strong> or <strong>Process unread</strong>,
            then refresh this tab.
          </div>
        ) : (
          <div className="space-y-3">
            {pending.map((item) => (
              <ReviewCard
                key={item.id}
                item={item}
                draftText={
                  draftEdits[item.id] ??
                  getDraftContent(item.proposedActions) ??
                  ""
                }
                onDraftChange={(value) =>
                  setDraftEdits((current) => ({
                    ...current,
                    [item.id]: value,
                  }))
                }
                busy={busyId === item.id}
                onApprove={() => onDecide(item, "approve")}
                onReject={() => onDecide(item, "reject")}
                onDelete={() => onDecide(item, "delete")}
                onQuickApply={(actions) => onQuickApply(item, actions)}
              />
            ))}
          </div>
        )}

        {done.length > 0 ? (
          <div className="space-y-2">
            <button
              type="button"
              className="text-sm text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => setShowDone((value) => !value)}
            >
              {showDone ? "Hide" : "Show"} already decided ({done.length})
            </button>
            {showDone ? (
              <div className="space-y-2 opacity-80">
                {done.map((item) => (
                  <ReviewCard
                    key={item.id}
                    item={item}
                    draftText=""
                    onDraftChange={() => {}}
                    busy={false}
                    onApprove={() => {}}
                    onReject={() => {}}
                    onDelete={() => {}}
                    onQuickApply={() => {}}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </LoadingContent>
  );
}

function ReviewCard({
  item,
  draftText,
  onDraftChange,
  busy,
  onApprove,
  onReject,
  onDelete,
  onQuickApply,
}: {
  item: ThunderbirdInboxItem;
  draftText: string;
  onDraftChange: (value: string) => void;
  busy: boolean;
  onApprove: () => void;
  onReject: () => void;
  onDelete: () => void;
  onQuickApply: (actions: ThunderbirdBridgeAction[]) => void;
}) {
  const hasDraft = item.proposedActions.some(
    (action) => action.type === "draft" || action.type === "reply",
  );
  const messageAge = describeAge(item.messageDate);
  const processedAge = describeAge(item.processedAt);
  const stale =
    item.messageDate &&
    Date.now() - new Date(item.messageDate).getTime() > 1000 * 60 * 60 * 24 * 7;

  return (
    <article className="rounded-lg border bg-background p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          <h2 className="truncate text-base font-semibold leading-snug">
            {item.subject || "(no subject)"}
          </h2>
          <p className="truncate text-sm text-muted-foreground">
            {formatFrom(item.from)}
          </p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span>
              Email {messageAge.label}
              {messageAge.exact ? ` · ${messageAge.exact}` : ""}
            </span>
            <span>Reviewed {processedAge.label}</span>
          </div>
          {stale ? (
            <p className="text-xs text-amber-700">
              Older than a week — double-check before approving a reply.
            </p>
          ) : null}
        </div>
        <StatusPill status={item.status} />
      </div>

      {item.snippet ? (
        <p className="mt-3 line-clamp-4 whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
          {item.snippet}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        {item.ruleNames.length > 0 ? (
          item.ruleNames.map((name) => (
            <span
              key={name}
              className="rounded-md bg-sky-50 px-2 py-0.5 text-xs text-sky-900"
            >
              {name}
            </span>
          ))
        ) : (
          <span className="text-xs text-muted-foreground">
            {item.reason || "No matching rule"}
          </span>
        )}
      </div>

      <div className="mt-3">
        <p className="mb-1.5 text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Proposed
        </p>
        {item.proposedActions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No AI suggestion — use quick actions below.
          </p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {item.proposedActions.map((action) => (
              <li
                key={action.id}
                className={cn(
                  "rounded-md px-2.5 py-1 text-sm",
                  action.type === "draft" || action.type === "reply"
                    ? "bg-violet-50 text-violet-950"
                    : "bg-muted text-foreground",
                )}
              >
                {formatAction(action)}
              </li>
            ))}
          </ul>
        )}
      </div>

      {item.status === "pending" ? (
        <>
          {hasDraft ? (
            <div className="mt-3 space-y-1.5">
              <Label htmlFor={`draft-${item.id}`}>Draft reply</Label>
              <textarea
                id={`draft-${item.id}`}
                className="min-h-24 w-full rounded-md border bg-background px-3 py-2 text-sm leading-relaxed"
                value={draftText}
                onChange={(event) => onDraftChange(event.target.value)}
              />
            </div>
          ) : null}

          <div className="mt-4 space-y-2">
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Quick actions
            </p>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                onClick={() =>
                  onQuickApply([
                    buildBridgeAction(item, "archive"),
                    buildBridgeAction(item, "mark_read"),
                  ])
                }
                disabled={busy}
              >
                Archive
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  onQuickApply([
                    buildBridgeAction(item, "label", {
                      labelName: "newsletter",
                    }),
                    buildBridgeAction(item, "archive"),
                    buildBridgeAction(item, "mark_read"),
                  ])
                }
                disabled={busy}
              >
                Newsletter
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  onQuickApply([
                    buildBridgeAction(item, "label", {
                      labelName: "receipt",
                    }),
                    buildBridgeAction(item, "archive"),
                    buildBridgeAction(item, "mark_read"),
                  ])
                }
                disabled={busy}
              >
                Receipt
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() =>
                  onQuickApply([
                    buildBridgeAction(item, "label", {
                      labelName: "needs-attention",
                    }),
                    buildBridgeAction(item, "mark_read"),
                  ])
                }
                disabled={busy}
              >
                Needs attention
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={onDelete}
                disabled={busy || item.thunderbirdMessageId == null}
              >
                Delete
              </Button>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onApprove}
              disabled={busy || item.proposedActions.length === 0}
            >
              {busy ? "Working…" : "Approve suggestion"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={onReject}
              disabled={busy}
            >
              Dismiss
            </Button>
          </div>
        </>
      ) : item.status === "approved" ? (
        <p className="mt-3 text-sm text-muted-foreground">
          Queued for Thunderbird.
        </p>
      ) : item.status === "rejected" ? (
        <p className="mt-3 text-sm text-muted-foreground">Dismissed.</p>
      ) : null}
    </article>
  );
}

function buildBridgeAction(
  item: ThunderbirdInboxItem,
  type: "archive" | "mark_read" | "label" | "trash",
  extra: { labelName?: string } = {},
): ThunderbirdBridgeAction {
  const base = {
    id: crypto.randomUUID(),
    messageId: item.messageId,
    threadId: item.threadId,
    thunderbirdMessageId: item.thunderbirdMessageId,
    thunderbirdAccountId: item.thunderbirdAccountId,
  };

  if (type === "label") {
    return {
      type: "label",
      ...base,
      labelName: extra.labelName || "label",
    };
  }
  if (type === "mark_read") {
    return { type: "mark_read", ...base, read: true };
  }
  if (type === "trash") {
    return { type: "trash", ...base };
  }
  return { type: "archive", ...base };
}

function StatusPill({ status }: { status: ThunderbirdInboxItem["status"] }) {
  return (
    <span
      className={cn(
        "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium capitalize",
        status === "pending" && "bg-amber-100 text-amber-950",
        status === "approved" && "bg-emerald-100 text-emerald-950",
        status === "rejected" && "bg-stone-200 text-stone-700",
        status === "applied" && "bg-sky-100 text-sky-950",
      )}
    >
      {status}
    </span>
  );
}

function describeAge(value?: string) {
  if (!value) return { label: "unknown date", exact: "" };
  const date = parseISO(value);
  if (!isValid(date)) {
    const fallback = new Date(value);
    if (!isValid(fallback)) return { label: "unknown date", exact: "" };
    return {
      label: `${formatDistanceToNowStrict(fallback, { addSuffix: true })}`,
      exact: fallback.toLocaleString(),
    };
  }
  return {
    label: formatDistanceToNowStrict(date, { addSuffix: true }),
    exact: date.toLocaleString(),
  };
}

function formatFrom(from: string) {
  const match = from.match(/^(.*)<([^>]+)>$/);
  if (!match) return from;
  const name = match[1].trim().replace(/^"|"$/g, "");
  return name ? `${name} · ${match[2]}` : match[2];
}

function getDraftContent(actions: ThunderbirdBridgeAction[]) {
  const draft = actions.find(
    (action) => action.type === "draft" || action.type === "reply",
  );
  return draft && "content" in draft ? draft.content : undefined;
}

function formatAction(action: ThunderbirdBridgeAction): string {
  switch (action.type) {
    case "archive":
      return "Archive";
    case "trash":
      return "Trash";
    case "bulk_archive":
      return `Bulk archive ${action.fromEmails.length} sender(s)`;
    case "bulk_trash":
      return `Bulk delete ${action.fromEmails.length} sender(s)`;
    case "mark_read":
      return action.read === false ? "Mark unread" : "Mark read";
    case "star":
      return "Star";
    case "mark_spam":
      return "Mark spam";
    case "label":
      return `Tag: ${action.labelName}`;
    case "move_folder":
      return `Move to ${action.folderName}`;
    case "draft":
      return "Draft reply";
    case "reply":
      return "Reply";
    case "send":
      return `Send to ${action.to}`;
    case "forward":
      return `Forward to ${action.to}`;
    default:
      return "Action";
  }
}
