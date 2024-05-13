"use client";

import { useState } from "react";
import useSWR from "swr";
import { useAtomValue } from "jotai";
import { Button, ButtonLoader } from "@/components/ui/button";
import { useModal, Modal } from "@/components/Modal";
import { SectionDescription } from "@/components/Typography";
import { ThreadsResponse } from "@/app/api/google/threads/controller";
import { ThreadsQuery } from "@/app/api/google/threads/validation";
import { LoadingContent } from "@/components/LoadingContent";
import { runAiRules } from "@/providers/QueueProvider";
import { aiQueueAtom } from "@/store/queue";
import { sleep } from "@/utils/sleep";
import { PremiumAlertWithData, usePremium } from "@/components/PremiumAlert";

export function BulkRunRules() {
  const { isModalOpen, openModal, closeModal } = useModal();
  const [totalThreads, setTotalThreads] = useState(0);

  const query: ThreadsQuery = { type: "inbox" };
  const { data, isLoading, error } = useSWR<ThreadsResponse>(
    `/api/google/threads?${new URLSearchParams(query as any).toString()}`,
  );

  const queue = useAtomValue(aiQueueAtom);
  const started = queue.size > 0;

  const { hasAiAccess, isLoading: isLoadingPremium } = usePremium();

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
                  {!hasAiAccess ? (
                    <Button
                      disabled={started}
                      onClick={() => {
                        onRun((count) =>
                          setTotalThreads((total) => total + count),
                        );
                      }}
                    >
                      {started && <ButtonLoader />}
                      Run AI On All Inbox Emails
                    </Button>
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
async function onRun(incrementThreadsQueued: (count: number) => void) {
  let nextPageToken = "";
  const LIMIT = 50;

  for (let i = 0; i < 100; i++) {
    const query: ThreadsQuery = { type: "inbox", nextPageToken, limit: LIMIT };
    const res = await fetch(
      `/api/google/threads?${new URLSearchParams(query as any).toString()}`,
    );
    const data: ThreadsResponse = await res.json();

    nextPageToken = data.nextPageToken || "";

    const threadsWithoutPlan = data.threads.filter((t) => !t.plan);

    incrementThreadsQueued(threadsWithoutPlan.length);

    runAiRules(threadsWithoutPlan);

    if (!nextPageToken || data.threads.length < LIMIT) break;

    // avoid gmail api rate limits
    // ai takes longer anyway
    sleep(5_000);
  }
}
