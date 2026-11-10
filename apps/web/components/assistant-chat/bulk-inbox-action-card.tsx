"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Badge, type Color } from "@/components/Badge";
import { toastError } from "@/components/Toast";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
} from "@/components/ui/card";
import { useBulkInboxActionJob } from "@/hooks/useBulkInboxActionJob";
import { useAccount } from "@/providers/EmailAccountProvider";
import { useChat } from "@/providers/ChatProvider";
import {
  cancelBulkInboxActionJob,
  confirmAssistantBulkInboxAction,
} from "@/utils/actions/assistant-chat";
import type { PendingBulkInboxActionToolOutput } from "@/utils/actions/assistant-chat.validation";
import type { BulkInboxActionType } from "@/utils/bulk-inbox-action/validation";

const ACTION_TITLES: Record<BulkInboxActionType, string> = {
  archive_threads: "Archive emails",
  trash_threads: "Move emails to trash",
  mark_read_threads: "Mark emails as read",
  label_threads: "Label emails",
};

const STATUS_BADGES: Record<string, { label: string; color: Color }> = {
  RUNNING: { label: "Running", color: "blue" },
  COMPLETED: { label: "Done", color: "green" },
  FAILED: { label: "Failed", color: "red" },
  CANCELLED: { label: "Stopped", color: "gray" },
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
  const [isStopping, setIsStopping] = useState(false);
  const [confirmedJobId, setConfirmedJobId] = useState<string | null>(null);

  const jobId = confirmedJobId ?? output.confirmationResult?.jobId ?? null;
  const { data: job, mutate } = useBulkInboxActionJob(jobId);
  const isProcessing = output.confirmationState === "processing";

  const { pendingAction, estimate, samples } = output;
  const title =
    pendingAction.action === "label_threads" && pendingAction.labelName
      ? `Label emails "${pendingAction.labelName}"`
      : ACTION_TITLES[pendingAction.action];
  const searchText = [
    pendingAction.search.query,
    pendingAction.search.fromEmail && `from ${pendingAction.search.fromEmail}`,
    pendingAction.search.readState,
    pendingAction.search.folderName && `in ${pendingAction.search.folderName}`,
    pendingAction.search.categoryName &&
      `category ${pendingAction.search.categoryName}`,
  ]
    .filter(Boolean)
    .join(", ");

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
    } finally {
      setIsStopping(false);
    }
  };

  const statusBadge = job ? STATUS_BADGES[job.status] : null;

  return (
    <Card>
      <CardHeader className="px-4 py-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-medium">{title}</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              {jobId ? "Running in the background" : "Pending confirmation"}
            </p>
          </div>
          {statusBadge && (
            <Badge color={statusBadge.color} className="text-xs">
              {statusBadge.label}
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-3 px-4 py-3.5 text-sm">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1">
          <dt className="text-muted-foreground">Search</dt>
          <dd className="break-words">{searchText}</dd>
          {pendingAction.instruction && (
            <>
              <dt className="text-muted-foreground">Only if</dt>
              <dd className="break-words">{pendingAction.instruction}</dd>
            </>
          )}
          {estimate && !jobId && (
            <>
              <dt className="text-muted-foreground">Matches</dt>
              <dd>
                {estimate.isLowerBound
                  ? `More than ${estimate.threadCount} threads`
                  : `${estimate.threadCount} threads`}
                {pendingAction.instruction
                  ? ", each checked against the condition"
                  : ""}
              </dd>
            </>
          )}
        </dl>

        {!jobId && samples && samples.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Examples</p>
            <ul className="space-y-1 rounded-md border bg-muted/30 px-3 py-2">
              {samples.map((sample, index) => (
                <li
                  key={`${sample.subject}-${index}`}
                  className="truncate text-xs"
                >
                  <span className="font-medium">{sample.from}</span>
                  {" · "}
                  {sample.subject}
                </li>
              ))}
            </ul>
          </div>
        )}

        {job && (
          <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs sm:grid-cols-4">
            <JobCount label="Checked" value={job.processedCount} />
            <JobCount label="Done" value={job.actedCount} />
            <JobCount label="Skipped" value={job.skippedCount} />
            <JobCount label="Failed" value={job.failedCount} />
          </dl>
        )}
        {job?.error && <p className="text-xs text-red-600">{job.error}</p>}
      </CardContent>

      {!jobId && (
        <CardFooter className="justify-end border-t px-4 py-3">
          <Button
            onClick={handleConfirm}
            disabled={disableConfirm || isConfirming || isProcessing}
            size="sm"
            variant={
              pendingAction.action === "trash_threads"
                ? "destructive"
                : "default"
            }
            className="gap-2"
          >
            {(isConfirming || isProcessing) && (
              <Loader2 className="size-4 animate-spin" />
            )}
            {isConfirming || isProcessing ? "Starting..." : "Confirm"}
          </Button>
        </CardFooter>
      )}

      {job?.status === "RUNNING" && (
        <CardFooter className="justify-end border-t px-4 py-3">
          <Button
            onClick={handleStop}
            disabled={isStopping}
            size="sm"
            variant="outline"
          >
            Stop
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}

function JobCount({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium tabular-nums">{value.toLocaleString()}</dd>
    </div>
  );
}
