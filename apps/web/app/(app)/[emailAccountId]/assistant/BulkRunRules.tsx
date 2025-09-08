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
import { PremiumAlertWithData, usePremium } from "@/components/PremiumAlert";
import { SetDateDropdown } from "@/app/(app)/[emailAccountId]/assistant/SetDateDropdown";
import { dateToSeconds } from "@/utils/date";
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
import { prefixPath } from "@/utils/path";
import { fetchWithAccount } from "@/utils/fetch";

export function BulkRunRules() {
  const { emailAccountId } = useAccount();

  const [isOpen, setIsOpen] = useState(false);
  const [totalThreads, setTotalThreads] = useState(0);

  const { data, isLoading, error } = useThreads({ type: "inbox" });

  const queue = useAiQueueState();

  const { hasAiAccess, isLoading: isLoadingPremium } = usePremium();

  const [running, setRunning] = useState(false);

  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  const abortRef = useRef<() => void>(undefined);

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
                  This runs your rules on unread emails currently in your inbox
                  (that have not been previously processed).
                </SectionDescription>

                {!!queue.size && (
                  <div className="rounded-md border border-green-200 bg-green-50 px-2 py-1.5 dark:border-green-800 dark:bg-green-950">
                    <SectionDescription className="mt-0">
                      Progress: {totalThreads - queue.size}/{totalThreads}{" "}
                      emails completed
                    </SectionDescription>
                  </div>
                )}
                <div className="space-y-4">
                  <LoadingContent loading={isLoadingPremium}>
                    {hasAiAccess ? (
                      <div className="flex flex-col space-y-2">
                        <div className="grid grid-cols-2 gap-2">
                          <SetDateDropdown
                            onChange={setStartDate}
                            value={startDate}
                            placeholder="Set start date"
                            disabled={running}
                          />
                          <SetDateDropdown
                            onChange={setEndDate}
                            value={endDate}
                            placeholder="Set end date (optional)"
                            disabled={running}
                          />
                        </div>

                        <Button
                          type="button"
                          disabled={running || !startDate}
                          loading={running}
                          onClick={async () => {
                            if (!startDate) return;
                            setRunning(true);
                            abortRef.current = await onRun(
                              emailAccountId,
                              { startDate, endDate },
                              (count) =>
                                setTotalThreads((total) => total + count),
                              () => setRunning(false),
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
                      </div>
                    ) : (
                      <PremiumAlertWithData />
                    )}
                  </LoadingContent>

                  <SectionDescription>
                    You can also process specific emails by visiting the{" "}
                    <Link
                      href={prefixPath(emailAccountId, "/mail")}
                      target="_blank"
                      className="font-semibold hover:underline"
                    >
                      Mail
                    </Link>{" "}
                    page.
                  </SectionDescription>
                </div>
              </>
            )}
          </LoadingContent>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// fetch batches of messages and add them to the ai queue
async function onRun(
  emailAccountId: string,
  { startDate, endDate }: { startDate: Date; endDate?: Date },
  incrementThreadsQueued: (count: number) => void,
  onComplete: () => void,
) {
  let nextPageToken = "";
  const LIMIT = 25;

  const startDateInSeconds = dateToSeconds(startDate);
  const endDateInSeconds = endDate ? dateToSeconds(endDate) : "";
  const q = `after:${startDateInSeconds} ${
    endDate ? `before:${endDateInSeconds}` : ""
  } is:unread`;

  let aborted = false;

  function abort() {
    aborted = true;
  }

  async function run() {
    for (let i = 0; i < 100; i++) {
      const query: ThreadsQuery = {
        type: "inbox",
        nextPageToken,
        limit: LIMIT,
        q,
      };
      const res = await fetchWithAccount({
        url: `/api/threads?${
          // biome-ignore lint/suspicious/noExplicitAny: simplest
          new URLSearchParams(query as any).toString()
        }`,
        emailAccountId,
      });
      const data: ThreadsResponse = await res.json();

      nextPageToken = data.nextPageToken || "";

      const threadsWithoutPlan = data.threads.filter((t) => !t.plan);

      incrementThreadsQueued(threadsWithoutPlan.length);

      runAiRules(emailAccountId, threadsWithoutPlan, false);

      if (!nextPageToken || aborted) break;

      // avoid gmail api rate limits
      // ai takes longer anyway
      await sleep(threadsWithoutPlan.length ? 5000 : 2000);
    }

    onComplete();
  }

  run();

  return abort;
}
