"use client";

import { useState } from "react";
import { useAtom } from "jotai";
import useSWR from "swr";
import { useAction } from "next-safe-action/hooks";
import {
  Loader2Icon,
  PauseIcon,
  PlayIcon,
  SquareIcon,
  XIcon,
} from "lucide-react";
import type { GetBulkRunsResponse } from "@/app/api/user/bulk-runs/route";
import {
  bulkRunPanelAtom,
  dismissedBulkRunsAtom,
} from "@/store/bulk-run-panel";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { LoadingContent } from "@/components/LoadingContent";
import { SetDateDropdown } from "@/app/(app)/[emailAccountId]/assistant/SetDateDropdown";
import { usePremium } from "@/hooks/usePremium";
import { hasTierAccess } from "@/utils/premium";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import { useAiAutomationStatus } from "@/hooks/useAiAutomationStatus";
import {
  startBulkRunAction,
  controlBulkRunAction,
} from "@/utils/actions/bulk-runs";
import { assertActionSucceeded } from "@/utils/error";
import { toastError } from "@/components/Toast";
import {
  isBulkRunTerminal,
  shouldShowBulkRunNotice,
} from "@/utils/bulk-rules/notice";

type Run = GetBulkRunsResponse["runs"][number];

export function BulkRunMonitor() {
  const [panel, setPanel] = useAtom(bulkRunPanelAtom);
  const [dismissed, setDismissed] = useAtom(dismissedBulkRunsAtom);
  const { data, error, isLoading, mutate } = useSWR<GetBulkRunsResponse>(
    "/api/user/bulk-runs",
    { refreshInterval: 2000 },
  );
  const latest = (data?.runs ?? []).filter(
    (run, index, runs) =>
      runs.findIndex((other) => other.emailAccountId === run.emailAccountId) ===
      index,
  );
  const selected = panel.runId
    ? data?.runs.find((run) => run.id === panel.runId)
    : latest.find((run) => run.emailAccountId === panel.emailAccountId);
  return (
    <>
      {latest
        .filter((run) => shouldShowBulkRunNotice(run, dismissed))
        .map((run) => (
          <div
            key={run.id}
            className="flex items-center justify-between gap-3 border-b bg-muted/50 px-4 py-2"
            role="status"
          >
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 text-left text-sm"
              onClick={() =>
                setPanel({
                  open: true,
                  emailAccountId: run.emailAccountId,
                  runId: run.id,
                })
              }
            >
              {!isBulkRunTerminal(run.status) && run.status !== "PAUSED" && (
                <Loader2Icon className="size-4 shrink-0 animate-spin" />
              )}
              {run.status === "PAUSED" && (
                <PauseIcon className="size-4 shrink-0" />
              )}
              <span className="truncate">
                <strong>Email processing · {run.emailAccount.email}</strong> —{" "}
                {describeRun(run)}
              </span>
            </button>
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                setPanel({
                  open: true,
                  emailAccountId: run.emailAccountId,
                  runId: run.id,
                })
              }
            >
              View progress
            </Button>
            {isBulkRunTerminal(run.status) && (
              <Button
                size="icon"
                variant="ghost"
                aria-label="Dismiss completed email processing"
                onClick={() => setDismissed((ids) => [...ids, run.id])}
              >
                <XIcon className="size-4" />
              </Button>
            )}
          </div>
        ))}
      <Dialog
        open={panel.open}
        onOpenChange={(open) => setPanel((value) => ({ ...value, open }))}
      >
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Bulk Process Emails</DialogTitle>
            <DialogDescription>
              Run your rules on emails already in your inbox.
            </DialogDescription>
          </DialogHeader>
          <LoadingContent loading={isLoading} error={error}>
            {data && (
              <BulkRunDialog
                key={panel.emailAccountId}
                emailAccountId={panel.emailAccountId}
                run={selected}
                onUpdate={async (runId) => {
                  await mutate();
                  if (runId) setPanel((value) => ({ ...value, runId }));
                }}
              />
            )}
          </LoadingContent>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BulkRunDialog({
  emailAccountId,
  run,
  onUpdate,
}: {
  emailAccountId: string;
  run?: Run;
  onUpdate: (runId?: string) => Promise<void>;
}) {
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [includeRead, setIncludeRead] = useState(false);
  const [rerun, setRerun] = useState(false);
  const [generateDraftReplies, setGenerateDraftReplies] = useState(false);
  const startAction = useAction(startBulkRunAction.bind(null, emailAccountId));
  const controlAction = useAction(
    controlBulkRunAction.bind(null, emailAccountId),
  );
  const busy = startAction.isExecuting || controlAction.isExecuting;
  const { hasAiAccess, tier } = usePremium();
  const { data: access } = useAiAutomationStatus();
  const { PremiumModal, openModal } = usePremiumModal();
  const extendedAccess = hasTierAccess({
    tier: tier || null,
    minimumTier: "PROFESSIONAL_MONTHLY",
  });
  const active = !!run && !isBulkRunTerminal(run.status);
  async function start() {
    if (!startDate) return;
    try {
      const result = await startAction.executeAsync({
        startDate,
        endDate,
        includeRead: extendedAccess && includeRead,
        rerun: extendedAccess && rerun,
        generateDraftReplies,
      });
      if (result?.serverError || result?.validationErrors || !result?.data)
        throw new Error(
          result?.serverError || "Check the date range and try again.",
        );
      await onUpdate(result.data.runId);
    } catch (error) {
      toastError({
        description:
          error instanceof Error
            ? error.message
            : "Could not start processing.",
      });
    }
  }
  async function control(command: "pause" | "resume" | "stop") {
    if (!run) return;
    try {
      const result = await controlAction.executeAsync({
        runId: run.id,
        command,
      });
      assertActionSucceeded(result);
      await onUpdate();
    } catch (error) {
      toastError({
        description:
          error instanceof Error
            ? error.message
            : "Could not update processing.",
      });
    }
  }
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        You can close this panel or browser. Processing continues while Inbox
        Zero is running.
      </p>
      {run && (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-medium">{run.emailAccount.email}</p>
              <p className="text-sm" aria-live="polite">
                {describeRun(run)}
              </p>
            </div>
            {active && (
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    control(run.status === "PAUSED" ? "resume" : "pause")
                  }
                >
                  {run.status === "PAUSED" ? (
                    <PlayIcon className="mr-1 size-4" />
                  ) : (
                    <PauseIcon className="mr-1 size-4" />
                  )}
                  {run.status === "PAUSED" ? "Resume" : "Pause"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => control("stop")}
                >
                  <SquareIcon className="mr-1 size-4" />
                  Stop
                </Button>
              </div>
            )}
          </div>
          {run.scannedAt && run.total > 0 && (
            <progress
              className="h-2 w-full"
              value={run.completed + run.failed}
              max={run.total}
              aria-label="Email processing progress"
            />
          )}
          <p className="text-xs text-muted-foreground">
            {new Date(run.startDate).toLocaleDateString()} –{" "}
            {run.endDate
              ? new Date(run.endDate).toLocaleDateString()
              : "present"}{" "}
            · {run.includeRead ? "Read and unread" : "Unread only"} ·{" "}
            {run.generateDraftReplies
              ? "Draft replies on"
              : "Draft replies off"}
          </p>
          {run.error && (
            <p role="alert" className="text-sm text-destructive">
              {run.error}
            </p>
          )}
          {active && (
            <p className="text-xs text-muted-foreground">
              Pause and stop take effect after the current email finishes.
              Resume skips failed emails; review those before starting another
              run.
            </p>
          )}
          {run.status === "COMPLETED" && run.total === 0 && (
            <p className="text-sm">
              No {run.includeRead ? "" : "unread "}
              {run.rerun ? "" : "unprocessed "}emails found in your inbox in the
              selected date range.
            </p>
          )}
          {!!run.items.length && (
            <div className="max-h-64 overflow-y-auto rounded border">
              <table className="w-full text-left text-sm">
                <thead className="sticky top-0 bg-muted">
                  <tr>
                    <th className="px-3 py-2">Recent emails</th>
                    <th className="px-3 py-2">Result</th>
                  </tr>
                </thead>
                <tbody>
                  {run.items.map((item) => (
                    <tr key={item.id} className="border-t">
                      <td className="max-w-80 px-3 py-2">
                        <span className="line-clamp-2">{item.subject}</span>
                      </td>
                      <td className="px-3 py-2">
                        {item.error ||
                          item.ruleNames.join(", ") ||
                          ({
                            PROCESSING: "Classifying…",
                            PENDING: "Queued",
                            COMPLETED: "No matching rule",
                            SKIPPED: "Skipped",
                            FAILED: "Failed",
                          }[item.status] ??
                            item.status)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
      {!active && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <SetDateDropdown
              value={startDate}
              onChange={setStartDate}
              placeholder="Set start date"
              disabled={busy}
            />
            <SetDateDropdown
              value={endDate}
              onChange={setEndDate}
              placeholder="Set end date (optional)"
              disabled={busy}
            />
          </div>
          <div className="divide-y rounded-lg border">
            <Option
              title="Include read emails"
              checked={extendedAccess && includeRead}
              onCheckedChange={setIncludeRead}
              onUpgrade={extendedAccess ? undefined : openModal}
            />
            <Option
              title="Rerun rules on already processed emails"
              checked={extendedAccess && rerun}
              onCheckedChange={setRerun}
              onUpgrade={extendedAccess ? undefined : openModal}
            />
            <Option
              title="Generate draft replies"
              checked={generateDraftReplies}
              onCheckedChange={setGenerateDraftReplies}
            />
          </div>
          {access?.status === "trial_ai_limit_reached" && (
            <p role="alert">{access.message}</p>
          )}
          <Button
            disabled={
              busy ||
              !startDate ||
              !hasAiAccess ||
              access?.status === "trial_ai_limit_reached"
            }
            onClick={start}
          >
            Process Emails
          </Button>
        </>
      )}
      <PremiumModal />
    </div>
  );
}

function Option({
  title,
  checked,
  onCheckedChange,
  onUpgrade,
}: {
  title: string;
  checked: boolean;
  onCheckedChange: (value: boolean) => void;
  onUpgrade?: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 p-3">
      <div>
        <p className="text-sm font-medium">{title}</p>
        {onUpgrade && (
          <p className="text-xs text-muted-foreground">
            Available on the Professional plan.
          </p>
        )}
      </div>
      {onUpgrade ? (
        <Button
          size="sm"
          variant="outline"
          aria-label={`Upgrade to use ${title.toLowerCase()}`}
          onClick={onUpgrade}
        >
          Upgrade
        </Button>
      ) : (
        <Switch
          aria-label={title}
          checked={checked}
          onCheckedChange={onCheckedChange}
        />
      )}
    </div>
  );
}
function describeRun(run: Run) {
  if (run.status === "SCANNING" || run.status === "QUEUED")
    return `Finding emails · ${run.total} found`;
  const progress = `${run.completed + run.failed} of ${run.total} processed${run.failed ? ` · ${run.failed} failed` : ""}`;
  return `${{ PAUSED: "Paused", RUNNING: "Processing", COMPLETED: "Complete", STOPPED: "Stopped" }[run.status] ?? run.status} · ${progress}`;
}
