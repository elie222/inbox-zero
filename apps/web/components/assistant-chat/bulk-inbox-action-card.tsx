"use client";

import { type ReactNode, useState } from "react";
import { CheckIcon, ChevronDownIcon, Loader2 } from "lucide-react";
import { toastError } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Progress } from "@/components/ui/progress";
import { useBulkInboxActionJob } from "@/hooks/useBulkInboxActionJob";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useChat } from "@/providers/ChatProvider";
import {
  cancelBulkInboxActionJob,
  confirmAssistantBulkInboxAction,
  dismissAssistantBulkInboxAction,
} from "@/utils/actions/assistant-chat";
import type { PendingBulkInboxActionToolOutput } from "@/utils/actions/assistant-chat.validation";
import type { BulkInboxActionType } from "@/utils/bulk-inbox-action/validation";

const ACTION_COPY: Record<
  BulkInboxActionType,
  { verb: string; running: string; done: string }
> = {
  archive_threads: { verb: "Archive", running: "Archiving", done: "Archived" },
  trash_threads: { verb: "Trash", running: "Trashing", done: "Trashed" },
  mark_read_threads: {
    verb: "Mark read",
    running: "Marking read",
    done: "Marked read",
  },
  label_threads: { verb: "Label", running: "Labeling", done: "Labeled" },
};

const MAX_SENDER_NAMES = 3;

const RESULT_PREFIXES: Record<string, string> = {
  CANCELLED: "Stopped · ",
  FAILED: "Couldn't finish · ",
};

export function BulkInboxActionCard({
  output,
  chatMessageId,
  toolCallId,
  disableConfirm,
}: {
  output: PendingBulkInboxActionToolOutput;
  chatMessageId: string;
  toolCallId: string;
  disableConfirm: boolean;
}) {
  const { emailAccountId } = useAccount();
  const { chatId } = useChat();
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [confirmedJobId, setConfirmedJobId] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  const jobId = confirmedJobId ?? output.confirmationResult?.jobId ?? null;
  const { data: job, mutate } = useBulkInboxActionJob(jobId);

  const { pendingAction, estimate, samples = [] } = output;
  const copy = ACTION_COPY[pendingAction.action];
  const isCancelled = dismissed || output.confirmationState === "cancelled";
  const isProcessing = output.confirmationState === "processing";

  const handleConfirm = async () => {
    if (!chatId) {
      toastError({ description: "Could not start this action." });
      return;
    }

    setIsConfirming(true);
    try {
      const result = await confirmAssistantBulkInboxAction(emailAccountId, {
        chatId,
        chatMessageId,
        toolCallId,
      });
      const confirmedId = result?.data?.confirmationResult?.jobId;
      if (result?.serverError || !confirmedId) {
        toastError({
          description: result?.serverError || "Could not start this action.",
        });
        return;
      }
      setConfirmedJobId(confirmedId);
    } catch {
      toastError({ description: "Could not start this action." });
    } finally {
      setIsConfirming(false);
    }
  };

  const handleDismiss = async () => {
    if (!chatId) return;
    setIsDismissing(true);
    try {
      const result = await dismissAssistantBulkInboxAction(emailAccountId, {
        chatId,
        chatMessageId,
        toolCallId,
      });
      if (result?.serverError) {
        toastError({ description: result.serverError });
        return;
      }
      setDismissed(true);
    } catch {
      toastError({ description: "Could not cancel this action." });
    } finally {
      setIsDismissing(false);
    }
  };

  const handleStop = async () => {
    if (!jobId) return;
    setIsStopping(true);
    try {
      const result = await cancelBulkInboxActionJob(emailAccountId, { jobId });
      if (result?.serverError) {
        toastError({ description: result.serverError });
        return;
      }
      await mutate();
    } catch {
      toastError({ description: "Could not stop this action. Try again." });
    } finally {
      setIsStopping(false);
    }
  };

  if (isCancelled) {
    return (
      <StatusCard>
        <span className="text-muted-foreground">
          Cancelled. Nothing changed.
        </span>
      </StatusCard>
    );
  }

  if (jobId) {
    if (!job || job.status === "RUNNING") {
      const acted = job?.actedCount ?? 0;
      const total = estimate?.searchThreadCount ?? 0;
      // The total is an estimate, so the bar never claims to be finished.
      const progress = total
        ? Math.min(95, ((job?.processedCount ?? 0) / total) * 100)
        : 0;
      return (
        <StatusCard
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={handleStop}
              disabled={isStopping}
            >
              Stop
            </Button>
          }
        >
          <div className="flex items-center gap-2">
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
            <span className="font-medium">{copy.running}…</span>
            {acted > 0 && (
              <span className="tabular-nums text-muted-foreground">
                {acted.toLocaleString()} so far
              </span>
            )}
          </div>
          <Progress
            value={progress}
            className="mt-2 h-1.5"
            aria-label={`${copy.running} progress`}
          />
        </StatusCard>
      );
    }

    return (
      <StatusCard>
        <div className="flex items-center gap-2">
          {job.status === "COMPLETED" && (
            <CheckIcon className="size-4 shrink-0 text-green-600" />
          )}
          <span className="font-medium">
            {getResultSentence({
              status: job.status,
              doneLabel: copy.done,
              acted: job.actedCount,
              kept: job.skippedCount,
              failed: job.failedCount,
            })}
          </span>
        </div>
        {job.error && (
          <p className="mt-1 text-xs text-muted-foreground">{job.error}</p>
        )}
      </StatusCard>
    );
  }

  const senders = getSenderNames(samples);
  const hasMore = (estimate?.threadCount ?? 0) > senders.length;

  return (
    <Card data-testid="bulk-inbox-action-card">
      <CardHeader className="space-y-1 border-b px-4 py-3.5">
        <h3 className="text-sm font-semibold leading-tight">
          {getTitle({ output, verb: copy.verb })}
        </h3>
        {senders.length > 0 && (
          <p className="truncate text-xs text-muted-foreground">
            {senders.join(", ")}
            {hasMore ? " + more" : ""}
          </p>
        )}
      </CardHeader>

      <Collapsible>
        <CardFooter className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <CollapsibleTrigger asChild>
            <Button
              variant="ghostMuted"
              size="sm"
              className="group h-8 gap-1 text-xs"
            >
              Details
              <ChevronDownIcon className="size-3.5 transition-transform group-data-[state=open]:rotate-180" />
            </Button>
          </CollapsibleTrigger>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleDismiss}
              disabled={isDismissing || isConfirming || isProcessing}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              variant={
                pendingAction.action === "trash_threads"
                  ? "destructive"
                  : "default"
              }
              onClick={handleConfirm}
              disabled={
                disableConfirm || isConfirming || isProcessing || isDismissing
              }
              className="gap-2"
            >
              {(isConfirming || isProcessing) && (
                <Loader2 className="size-4 animate-spin" />
              )}
              {copy.verb}
            </Button>
          </div>
        </CardFooter>
        <CollapsibleContent>
          <CardContent className="space-y-1 border-t px-4 py-3 text-xs text-muted-foreground">
            <p className="break-words">
              Search: {formatSearch(pendingAction.search)}
            </p>
            {pendingAction.instruction && (
              <p className="break-words">
                Only if: {pendingAction.instruction}
              </p>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}

function StatusCard({
  children,
  action,
}: {
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card data-testid="bulk-inbox-action-card">
      <CardContent className="flex items-center gap-3 px-4 py-3 text-sm">
        <div className="min-w-0 flex-1">{children}</div>
        {action}
      </CardContent>
    </Card>
  );
}

function getTitle({
  output,
  verb,
}: {
  output: PendingBulkInboxActionToolOutput;
  verb: string;
}) {
  const { estimate, matchSummary, pendingAction, samples = [] } = output;
  const count = estimate
    ? `${estimate.isApproximate ? "~" : ""}${estimate.threadCount.toLocaleString()}`
    : "";
  const senders = getSenderNames(samples);
  const what =
    matchSummary ||
    (senders.length === 1 ? `emails from ${senders[0]}` : "emails");
  const label =
    pendingAction.action === "label_threads" && pendingAction.labelName
      ? ` as "${pendingAction.labelName}"`
      : "";
  return [verb, count, what].filter(Boolean).join(" ") + label;
}

function getResultSentence({
  status,
  doneLabel,
  acted,
  kept,
  failed,
}: {
  status: string;
  doneLabel: string;
  acted: number;
  kept: number;
  failed: number;
}) {
  const parts = [`${doneLabel} ${acted.toLocaleString()}`];
  if (kept) parts.push(`kept ${kept.toLocaleString()}`);
  if (failed) parts.push(`${failed.toLocaleString()} failed`);
  return (RESULT_PREFIXES[status] ?? "") + parts.join(" · ");
}

function getSenderNames(samples: Array<{ from: string }>) {
  const names = samples.map((sample) => {
    const match = sample.from.match(/^\s*"?([^"<]+?)"?\s*</);
    return (match?.[1] ?? sample.from).trim();
  });
  return [...new Set(names.filter(Boolean))].slice(0, MAX_SENDER_NAMES);
}

function formatSearch(
  search: PendingBulkInboxActionToolOutput["pendingAction"]["search"],
) {
  return [
    search.query,
    search.fromEmail && `from ${search.fromEmail}`,
    search.readState,
    search.folderName && `in ${search.folderName}`,
    search.categoryName && `category ${search.categoryName}`,
  ]
    .filter(Boolean)
    .join(", ");
}
