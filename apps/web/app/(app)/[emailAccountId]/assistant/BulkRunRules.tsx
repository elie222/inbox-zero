"use client";

import { useReducer, useRef, useState } from "react";
import { PauseIcon, PlayIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionDescription } from "@/components/Typography";
import { LoadingContent } from "@/components/LoadingContent";
import { pauseAiQueue, resumeAiQueue } from "@/utils/queue/ai-queue";
import { toastError } from "@/components/Toast";
import { PremiumAlertWithData } from "@/components/PremiumAlert";
import { usePremium } from "@/hooks/usePremium";
import { SetDateDropdown } from "@/app/(app)/[emailAccountId]/assistant/SetDateDropdown";
import { useBeforeUnload } from "@/hooks/useBeforeUnload";
import { useAiQueueState, clearAiQueueAtom } from "@/store/ai-queue";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAccount } from "@/providers/EmailAccountProvider";
import { Toggle } from "@/components/Toggle";
import { hasTierAccess } from "@/utils/premium";
import { BulkProcessActivityLog } from "@/app/(app)/[emailAccountId]/assistant/BulkProcessActivityLog";
import {
  bulkRunReducer,
  getProgressMessage,
  initialBulkRunState,
} from "@/app/(app)/[emailAccountId]/assistant/bulk-run-rules-reducer";
import { useEndStripeTrial } from "@/hooks/useEndStripeTrial";
import { onRun } from "@/app/(app)/[emailAccountId]/assistant/bulk-run";
import { useAiAutomationStatus } from "@/hooks/useAiAutomationStatus";

const TRIAL_BULK_PROCESS_EMAIL_LIMIT = 200;

export function BulkRunRules() {
  const { emailAccountId } = useAccount();

  const [isOpen, setIsOpen] = useState(false);
  const [state, dispatch] = useReducer(bulkRunReducer, initialBulkRunState);

  const queue = useAiQueueState();

  const {
    hasAiAccess,
    isLoading: isLoadingPremium,
    premium,
    tier,
  } = usePremium();
  const { loading: loadingEndTrial, endTrial } = useEndStripeTrial();
  const { data: aiAutomationStatus } = useAiAutomationStatus();

  const isBusinessPlusTier = hasTierAccess({
    tier: tier || null,
    minimumTier: "PROFESSIONAL_MONTHLY",
  });
  const isTrial = premium?.stripeSubscriptionStatus === "trialing";
  const trialAiLimitMessage =
    aiAutomationStatus?.status === "trial_ai_limit_reached"
      ? aiAutomationStatus.message
      : null;

  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [includeRead, setIncludeRead] = useState(false);

  const abortRef = useRef<() => void>(undefined);

  // Derived state
  const remaining = new Set(
    [...state.processedThreadIds].filter((id) => queue.has(id)),
  ).size;
  const completed = state.processedThreadIds.size - remaining;
  const isProcessing = queue.size > 0;
  const isPaused = state.status === "paused";
  const isBusy = isProcessing || state.status === "processing";

  // Warn user before leaving page during processing (includes initial fetch)
  useBeforeUnload(isBusy);

  const handleStart = async () => {
    dispatch({ type: "START" });

    if (!startDate) {
      toastError({ description: "Please select a start date" });
      dispatch({ type: "RESET" });
      return;
    }
    if (!emailAccountId) {
      toastError({
        description: "Email account ID is missing. Please refresh the page.",
      });
      dispatch({ type: "RESET" });
      return;
    }

    // Ensure queue is not paused from a previous run
    resumeAiQueue();

    try {
      abortRef.current = await onRun(
        emailAccountId,
        {
          startDate,
          endDate,
          includeRead,
          maxEmails: isTrial ? TRIAL_BULK_PROCESS_EMAIL_LIMIT : undefined,
        },
        (threads) => {
          dispatch({ type: "THREADS_QUEUED", threads });
        },
        (completionStatus, count) => {
          if (completionStatus !== "success") {
            clearAiQueueAtom();
            dispatch({ type: "STOP", completedCount: count });
            return;
          }

          dispatch({ type: "COMPLETE", count });
        },
      );
    } catch (error) {
      console.error("Failed to start bulk processing:", error);
      toastError({
        title: "Failed to start",
        description: "An error occurred. Please try again.",
      });
      dispatch({ type: "RESET" });
    }
  };

  const handlePauseResume = () => {
    if (isPaused) {
      resumeAiQueue();
      dispatch({ type: "RESUME" });
    } else {
      pauseAiQueue();
      dispatch({ type: "PAUSE" });
    }
  };

  const handleStop = () => {
    dispatch({ type: "STOP", completedCount: completed });
    abortRef.current?.();
    clearAiQueueAtom();
  };

  const progressMessage = getProgressMessage(state, remaining);

  return (
    <div>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            Process Past Emails
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>Bulk Process Emails</DialogTitle>
            <DialogDescription>
              Run your rules on emails in your inbox that haven't been handled
              yet.
            </DialogDescription>
          </DialogHeader>
          {progressMessage && (
            <div className="rounded-md border border-green-200 bg-green-50 px-2 py-1.5 dark:border-green-800 dark:bg-green-950">
              <SectionDescription className="mt-0">
                {progressMessage}
              </SectionDescription>
            </div>
          )}
          <LoadingContent loading={isLoadingPremium}>
            <div className="flex min-w-0 flex-col space-y-4 overflow-hidden">
              <PremiumAlertWithData className="mr-auto" />

              <div className="grid grid-cols-2 gap-2">
                <SetDateDropdown
                  onChange={(date) => {
                    setStartDate(date);
                    dispatch({ type: "RESET" });
                  }}
                  value={startDate}
                  placeholder="Set start date"
                  disabled={isProcessing}
                />
                <SetDateDropdown
                  onChange={(date) => {
                    setEndDate(date);
                    dispatch({ type: "RESET" });
                  }}
                  value={endDate}
                  placeholder="Set end date (optional)"
                  disabled={isProcessing}
                />
              </div>

              <Toggle
                name="include-read"
                label="Include read emails"
                enabled={includeRead}
                onChange={(enabled) => setIncludeRead(enabled)}
                disabled={isProcessing || !isBusinessPlusTier}
                disabledTooltipText={
                  !isBusinessPlusTier && hasAiAccess
                    ? "Including read emails is available on the Professional plan."
                    : undefined
                }
              />

              {isTrial && (
                <div className="flex flex-col gap-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200 sm:flex-row sm:items-center sm:justify-between">
                  <span>
                    {trialAiLimitMessage ??
                      `Trials can process up to ${TRIAL_BULK_PROCESS_EMAIL_LIMIT} past emails at a time.`}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    loading={loadingEndTrial}
                    onClick={endTrial}
                    className="self-start border-blue-300 bg-white text-blue-900 hover:bg-blue-100 dark:border-blue-700 dark:bg-blue-950 dark:text-blue-100 dark:hover:bg-blue-900 sm:self-auto"
                  >
                    Start paid plan now
                  </Button>
                </div>
              )}

              {(state.status !== "idle" ||
                state.processedThreadIds.size > 0) && (
                <BulkProcessActivityLog
                  threads={Array.from(state.fetchedThreads.values())}
                  processedThreadIds={state.processedThreadIds}
                  aiQueue={queue}
                  paused={isPaused}
                  loading={
                    state.status === "processing" &&
                    state.processedThreadIds.size === 0
                  }
                />
              )}

              {(state.status === "idle" || state.status === "stopped") &&
                !isProcessing && (
                  <Button
                    type="button"
                    disabled={
                      !startDate ||
                      !emailAccountId ||
                      !hasAiAccess ||
                      trialAiLimitMessage !== null
                    }
                    onClick={handleStart}
                  >
                    Process Emails
                  </Button>
                )}
              {isBusy && (
                <div className="flex justify-end gap-2">
                  <Button size="sm" onClick={handlePauseResume}>
                    {isPaused ? (
                      <>
                        <PlayIcon className="mr-1.5 h-3.5 w-3.5" />
                        Resume
                      </>
                    ) : (
                      <>
                        <PauseIcon className="mr-1.5 h-3.5 w-3.5" />
                        Pause
                      </>
                    )}
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleStop}>
                    <SquareIcon className="mr-1.5 h-3.5 w-3.5" />
                    Stop
                  </Button>
                </div>
              )}

              {state.runResult && state.runResult.count === 0 && (
                <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
                  No {includeRead ? "" : "unread, "}unprocessed emails found in
                  the selected date range.
                </div>
              )}
            </div>
          </LoadingContent>
        </DialogContent>
      </Dialog>
    </div>
  );
}
