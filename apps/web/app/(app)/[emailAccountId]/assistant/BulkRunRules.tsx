"use client";

import { useReducer, useRef, useState } from "react";
import Link from "next/link";
import { HistoryIcon, PauseIcon, PlayIcon, SquareIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionDescription } from "@/components/Typography";
import type { ThreadsResponse } from "@/app/api/threads/route";
import type { ThreadsQuery } from "@/app/api/threads/validation";
import { LoadingContent } from "@/components/LoadingContent";
import { runAiRules } from "@/utils/queue/email-actions";
import {
  pauseAiQueue,
  resumeAiQueue,
  clearAiQueue,
} from "@/utils/queue/ai-queue";
import { sleep } from "@/utils/sleep";
import { toastError } from "@/components/Toast";
import { PremiumAlertWithData, usePremium } from "@/components/PremiumAlert";
import { SetDateDropdown } from "@/app/(app)/[emailAccountId]/assistant/SetDateDropdown";
import { useThreads } from "@/hooks/useThreads";
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
import { fetchWithAccount } from "@/utils/fetch";
import { Toggle } from "@/components/Toggle";
import { hasTierAccess } from "@/utils/premium";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";
import { BulkProcessActivityLog } from "@/app/(app)/[emailAccountId]/assistant/BulkProcessActivityLog";
import {
  bulkRunReducer,
  getProgressMessage,
  initialBulkRunState,
} from "@/app/(app)/[emailAccountId]/assistant/bulk-run-rules-reducer";

export function BulkRunRules() {
  const { emailAccountId } = useAccount();

  const [isOpen, setIsOpen] = useState(false);
  const [state, dispatch] = useReducer(bulkRunReducer, initialBulkRunState);

  const { data, isLoading, error } = useThreads({ type: "inbox" });

  const queue = useAiQueueState();

  const { hasAiAccess, isLoading: isLoadingPremium, tier } = usePremium();
  const { PremiumModal, openModal } = usePremiumModal();

  const isBusinessPlusTier = hasTierAccess({
    tier: tier || null,
    minimumTier: "BUSINESS_PLUS_MONTHLY",
  });

  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [includeRead, setIncludeRead] = useState(false);

  const abortRef = useRef<() => void>(undefined);

  // Derived state
  const remaining = new Set(
    [...state.processedThreadIds].filter((id) => queue.has(id)),
  ).size;
  const completed = state.processedThreadIds.size - remaining;
  const isActive = state.status === "processing" || state.status === "paused";
  const isProcessing = isActive || queue.size > 0;
  const isPaused = state.status === "paused";

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

    abortRef.current = await onRun(
      emailAccountId,
      { startDate, endDate, includeRead },
      (ids) => {
        dispatch({ type: "THREADS_QUEUED", ids });
      },
      (_completionStatus, count) => {
        dispatch({ type: "COMPLETE", count });
      },
    );
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
    clearAiQueue();
    clearAiQueueAtom();
    abortRef.current?.();
  };

  const progressMessage = getProgressMessage(state, remaining);

  return (
    <div>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" Icon={HistoryIcon}>
            Bulk Process Emails
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
          <LoadingContent loading={isLoading} error={error}>
            {data && (
              <>
                {progressMessage && (
                  <div className="rounded-md border border-green-200 bg-green-50 px-2 py-1.5 dark:border-green-800 dark:bg-green-950">
                    <SectionDescription className="mt-0">
                      {progressMessage}
                    </SectionDescription>
                  </div>
                )}
                <LoadingContent loading={isLoadingPremium}>
                  {hasAiAccess ? (
                    <div className="flex flex-col space-y-4">
                      <div className="grid grid-cols-2 gap-2">
                        <SetDateDropdown
                          onChange={(date) => {
                            setStartDate(date);
                            dispatch({ type: "RESET" });
                          }}
                          value={startDate}
                          placeholder="Set start date"
                          disabled={isActive}
                        />
                        <SetDateDropdown
                          onChange={(date) => {
                            setEndDate(date);
                            dispatch({ type: "RESET" });
                          }}
                          value={endDate}
                          placeholder="Set end date (optional)"
                          disabled={isActive}
                        />
                      </div>

                      <div className="flex items-center justify-between gap-4">
                        <Toggle
                          name="include-read"
                          label="Include read emails"
                          enabled={includeRead}
                          onChange={(enabled) => setIncludeRead(enabled)}
                          disabled={isActive || !isBusinessPlusTier}
                        />
                        {!isBusinessPlusTier && (
                          <Link
                            href="/premium"
                            onClick={(e) => {
                              e.preventDefault();
                              openModal();
                            }}
                            className="text-sm text-primary hover:underline whitespace-nowrap"
                          >
                            Upgrade to Professional to enable
                          </Link>
                        )}
                      </div>

                      {(isActive || state.processedThreadIds.size > 0) && (
                        <BulkProcessActivityLog
                          threads={data.threads}
                          processedThreadIds={state.processedThreadIds}
                          aiQueue={queue}
                          paused={isPaused}
                          loading={
                            isActive && state.processedThreadIds.size === 0
                          }
                        />
                      )}

                      {!isProcessing && (
                        <Button
                          type="button"
                          disabled={!startDate || !emailAccountId}
                          onClick={handleStart}
                        >
                          Process Emails
                        </Button>
                      )}
                      {isProcessing && (
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
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleStop}
                          >
                            <SquareIcon className="mr-1.5 h-3.5 w-3.5" />
                            Stop
                          </Button>
                        </div>
                      )}

                      {state.runResult && state.runResult.count === 0 && (
                        <div className="mt-4 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-800 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-200">
                          No {includeRead ? "" : "unread "}emails found in the
                          selected date range.
                        </div>
                      )}
                    </div>
                  ) : (
                    <PremiumAlertWithData />
                  )}
                </LoadingContent>
              </>
            )}
          </LoadingContent>
        </DialogContent>
      </Dialog>
      <PremiumModal />
    </div>
  );
}

// fetch batches of messages and add them to the ai queue
async function onRun(
  emailAccountId: string,
  {
    startDate,
    endDate,
    includeRead,
  }: { startDate: Date; endDate?: Date; includeRead?: boolean },
  onThreadsQueued: (threadIds: string[]) => void,
  onComplete: (
    status: "success" | "error" | "cancelled",
    count: number,
  ) => void,
) {
  let nextPageToken = "";
  const LIMIT = 25;
  let totalProcessed = 0;

  let aborted = false;

  function abort() {
    aborted = true;
  }

  async function run() {
    for (let i = 0; i < 100; i++) {
      const query: ThreadsQuery = {
        type: "inbox",
        limit: LIMIT,
        after: startDate,
        ...(endDate ? { before: endDate } : {}),
        ...(!includeRead ? { isUnread: true } : {}),
        ...(nextPageToken ? { nextPageToken } : {}),
      };

      const res = await fetchWithAccount({
        url: `/api/threads?${
          // biome-ignore lint/suspicious/noExplicitAny: simplest
          new URLSearchParams(query as any).toString()
        }`,
        emailAccountId,
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        console.error("Failed to fetch threads:", res.status, errorData);
        toastError({
          title: "Failed to fetch emails",
          description:
            typeof errorData.error === "string"
              ? errorData.error
              : `Error: ${res.status}`,
        });
        onComplete("error", totalProcessed);
        return;
      }

      const data: ThreadsResponse = await res.json();

      if (!data.threads) {
        console.error("Invalid response: missing threads", data);
        toastError({
          title: "Invalid response",
          description: "Failed to process emails. Please try again.",
        });
        onComplete("error", totalProcessed);
        return;
      }

      nextPageToken = data.nextPageToken || "";

      const threadsWithoutPlan = data.threads.filter((t) => !t.plan);

      onThreadsQueued(threadsWithoutPlan.map((t) => t.id));
      totalProcessed += threadsWithoutPlan.length;

      runAiRules(emailAccountId, threadsWithoutPlan, false);

      if (aborted) {
        onComplete("cancelled", totalProcessed);
        return;
      }

      if (!nextPageToken) break;

      // avoid gmail api rate limits
      // ai takes longer anyway
      await sleep(threadsWithoutPlan.length ? 5000 : 2000);
    }

    onComplete("success", totalProcessed);
  }

  run();

  return abort;
}
