"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { HistoryIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionDescription } from "@/components/Typography";
import type { ThreadsResponse } from "@/app/api/threads/route";
import type { ThreadsQuery } from "@/app/api/threads/validation";
import { LoadingContent } from "@/components/LoadingContent";
import { runAiRules } from "@/utils/queue/email-actions";
import { sleep } from "@/utils/sleep";
import { toastError } from "@/components/Toast";
import { PremiumAlertWithData, usePremium } from "@/components/PremiumAlert";
import { SetDateDropdown } from "@/app/(app)/[emailAccountId]/assistant/SetDateDropdown";
import { useThreads } from "@/hooks/useThreads";
import { useAiQueueState } from "@/store/ai-queue";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useAccount } from "@/providers/EmailAccountProvider";
import { fetchWithAccount } from "@/utils/fetch";
import { Toggle } from "@/components/Toggle";
import { hasTierAccess } from "@/utils/premium";
import { usePremiumModal } from "@/app/(app)/premium/PremiumModal";

export function BulkRunRules() {
  const { emailAccountId } = useAccount();

  const [isOpen, setIsOpen] = useState(false);
  const [processedThreadIds, setProcessedThreadIds] = useState<Set<string>>(
    new Set(),
  );

  const { data, isLoading, error } = useThreads({ type: "inbox" });

  const queue = useAiQueueState();

  const { hasAiAccess, isLoading: isLoadingPremium, tier } = usePremium();
  const { PremiumModal, openModal } = usePremiumModal();

  const isBusinessPlusTier = hasTierAccess({
    tier: tier || null,
    minimumTier: "BUSINESS_PLUS_MONTHLY",
  });

  const [running, setRunning] = useState(false);

  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();
  const [includeRead, setIncludeRead] = useState(false);
  const [runResult, setRunResult] = useState<{
    count: number;
  } | null>(null);

  const abortRef = useRef<() => void>(undefined);

  const remaining = new Set(
    [...processedThreadIds].filter((id) => queue.has(id)),
  ).size;
  const completed = processedThreadIds.size - remaining;

  return (
    <div>
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogTrigger asChild>
          <Button type="button" variant="outline" Icon={HistoryIcon}>
            Bulk Process Emails
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Process Existing Inbox Emails</DialogTitle>
          </DialogHeader>
          <LoadingContent loading={isLoading} error={error}>
            {data && (
              <>
                <SectionDescription>
                  This runs your rules on {includeRead ? "all" : "unread"}{" "}
                  emails currently in your inbox (that have not been previously
                  processed).
                </SectionDescription>

                {processedThreadIds.size > 0 && (
                  <div className="rounded-md border border-green-200 bg-green-50 px-2 py-1.5 dark:border-green-800 dark:bg-green-950">
                    <SectionDescription className="mt-0">
                      {remaining > 0
                        ? `Progress: ${completed}/${processedThreadIds.size} emails completed`
                        : `Success: Processed ${processedThreadIds.size} emails`}
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
                            setRunResult(null);
                            setProcessedThreadIds(new Set());
                          }}
                          value={startDate}
                          placeholder="Set start date"
                          disabled={running}
                        />
                        <SetDateDropdown
                          onChange={(date) => {
                            setEndDate(date);
                            setRunResult(null);
                            setProcessedThreadIds(new Set());
                          }}
                          value={endDate}
                          placeholder="Set end date (optional)"
                          disabled={running}
                        />
                      </div>

                      <div className="flex items-center justify-between gap-4">
                        <Toggle
                          name="include-read"
                          label="Include read emails"
                          enabled={includeRead}
                          onChange={(enabled) => setIncludeRead(enabled)}
                          disabled={running || !isBusinessPlusTier}
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

                      <Button
                        type="button"
                        disabled={running || !startDate || !emailAccountId}
                        loading={running}
                        onClick={async () => {
                          setRunResult(null);
                          setProcessedThreadIds(new Set());
                          if (!startDate) {
                            toastError({
                              description: "Please select a start date",
                            });
                            return;
                          }
                          if (!emailAccountId) {
                            toastError({
                              description:
                                "Email account ID is missing. Please refresh the page.",
                            });
                            return;
                          }
                          setRunning(true);
                          abortRef.current = await onRun(
                            emailAccountId,
                            { startDate, endDate, includeRead },
                            (ids) => {
                              setProcessedThreadIds((prev) => {
                                const next = new Set(prev);
                                for (const id of ids) {
                                  next.add(id);
                                }
                                return next;
                              });
                            },
                            (status, count) => {
                              setRunning(false);
                              if (status === "success" && count === 0) {
                                setRunResult({ count });
                              }
                            },
                          );
                        }}
                      >
                        Process Emails
                      </Button>
                      {running && (
                        <Button
                          variant="outline"
                          onClick={() => abortRef.current?.()}
                        >
                          Cancel
                        </Button>
                      )}

                      {runResult && runResult.count === 0 && (
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
