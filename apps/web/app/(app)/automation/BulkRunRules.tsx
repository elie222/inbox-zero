"use client";

import { useRef, useState } from "react";
import useSWR from "swr";
import { useAtomValue } from "jotai";
import { Button, ButtonLoader } from "@/components/ui/button";
import { useModal, Modal } from "@/components/Modal";
import { SectionDescription } from "@/components/Typography";
import type { ThreadsResponse } from "@/app/api/google/threads/controller";
import type { ThreadsQuery } from "@/app/api/google/threads/validation";
import { LoadingContent } from "@/components/LoadingContent";
import { runAiRules } from "@/providers/QueueProvider";
import { aiQueueAtom } from "@/store/queue";
import { sleep } from "@/utils/sleep";
import { PremiumAlertWithData, usePremium } from "@/components/PremiumAlert";
import { SetDateDropdown } from "@/app/(app)/automation/SetDateDropdown";
import { dateToSeconds } from "@/utils/date";

export function BulkRunRules() {
  const { isModalOpen, openModal, closeModal } = useModal();
  const [totalThreads, setTotalThreads] = useState(0);

  const query: ThreadsQuery = { type: "inbox" };
  const { data, isLoading, error } = useSWR<ThreadsResponse>(
    `/api/google/threads?${new URLSearchParams(query as any).toString()}`,
  );

  const queue = useAtomValue(aiQueueAtom);

  const { hasAiAccess, isLoading: isLoadingPremium } = usePremium();

  const [running, setRunning] = useState(false);

  const [startDate, setStartDate] = useState<Date | undefined>();
  const [endDate, setEndDate] = useState<Date | undefined>();

  const abortRef = useRef<() => void>();

  return (
    <div>
      <Button type="button" variant="outline" onClick={openModal}>
        Bulk Run on Inbox
      </Button>
      <Modal
        isOpen={isModalOpen}
        hideModal={closeModal}
        title="Run against all emails in inbox"
      >
        <LoadingContent loading={isLoading} error={error}>
          {data && (
            <>
              <SectionDescription className="mt-2">
                If you want to select individual emails instead, go to the{" "}
                {`"Early Access > Mail"`} page, mark the emails you want to run
                rules on, and click the {`"Run AI Rules"`} button.
              </SectionDescription>
              <SectionDescription className="mt-2">
                This will not run on emails that already have an AI plan set.
              </SectionDescription>
              {!!queue.size && (
                <SectionDescription className="mt-2">
                  There are {queue.size}/{totalThreads || queue.size} emails
                  left to be processed.
                </SectionDescription>
              )}
              <div className="mt-4">
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
                        onClick={async () => {
                          if (!startDate) return;
                          setRunning(true);
                          abortRef.current = await onRun(
                            { startDate, endDate },
                            (count) =>
                              setTotalThreads((total) => total + count),
                            () => setRunning(false),
                          );
                        }}
                      >
                        {running && <ButtonLoader />}
                        Run AI On All Inbox Emails
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
              </div>
            </>
          )}
        </LoadingContent>
      </Modal>
    </div>
  );
}

// fetch batches of messages and add them to the ai queue
async function onRun(
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
  }`;

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
      const res = await fetch(
        `/api/google/threads?${new URLSearchParams(query as any).toString()}`,
      );
      const data: ThreadsResponse = await res.json();

      nextPageToken = data.nextPageToken || "";

      const threadsWithoutPlan = data.threads.filter((t) => !t.plan);

      incrementThreadsQueued(threadsWithoutPlan.length);

      runAiRules(threadsWithoutPlan);

      if (!nextPageToken || aborted) break;

      // avoid gmail api rate limits
      // ai takes longer anyway
      await sleep(threadsWithoutPlan.length ? 5_000 : 2_000);
    }

    onComplete();
  }

  run();

  return abort;
}
