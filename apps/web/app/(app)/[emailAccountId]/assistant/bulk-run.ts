import type { ThreadsResponse } from "@/app/api/threads/route";
import type { ThreadsQuery } from "@/utils/threads/validation";
import { runAiRules } from "@/utils/queue/email-actions";
import { sleep } from "@/utils/sleep";
import { toastError } from "@/components/Toast";
import { captureException } from "@/utils/error";
import { fetchWithAccount } from "@/utils/fetch";
import { createSearchParams } from "@/utils/url";

const BATCH_SIZE = 25;

export async function onRun(
  emailAccountId: string,
  {
    startDate,
    endDate,
    includeRead,
    maxEmails,
  }: {
    startDate: Date;
    endDate?: Date;
    includeRead?: boolean;
    maxEmails?: number;
  },
  onThreadsQueued: (threads: ThreadsResponse["threads"]) => void,
  onComplete: (
    status: "success" | "error" | "cancelled",
    count: number,
  ) => void,
) {
  let nextPageToken = "";
  let totalProcessed = 0;
  let aborted = false;
  const abortController = new AbortController();

  function abort() {
    aborted = true;
    abortController.abort();
  }

  async function run() {
    for (let i = 0; i < 100; i++) {
      if (completeIfCancelled()) return;

      const query: ThreadsQuery = {
        type: "inbox",
        limit: BATCH_SIZE,
        after: startDate,
        ...(endDate ? { before: endDate } : {}),
        ...(!includeRead ? { isUnread: true } : {}),
        ...(nextPageToken ? { nextPageToken } : {}),
      };

      let response: Response;
      try {
        response = await fetchWithAccount({
          url: `/api/threads?${createSearchParams(query).toString()}`,
          emailAccountId,
          init: { signal: abortController.signal },
        });
      } catch (error) {
        if (completeIfCancelled()) return;
        throw error;
      }

      if (completeIfCancelled()) return;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        toastError({
          title: "Failed to fetch emails",
          description:
            typeof errorData.error === "string"
              ? errorData.error
              : `Error: ${response.status}`,
        });
        onComplete("error", totalProcessed);
        return;
      }

      const data: ThreadsResponse = await response.json();
      if (completeIfCancelled()) return;

      if (!data.threads) {
        toastError({
          title: "Invalid response",
          description: "Failed to process emails. Please try again.",
        });
        onComplete("error", totalProcessed);
        return;
      }

      nextPageToken = data.nextPageToken || "";

      const threadsWithoutPlan = data.threads.filter((thread) => !thread.plan);
      const remainingEmails =
        maxEmails === undefined ? undefined : maxEmails - totalProcessed;
      if (remainingEmails !== undefined && remainingEmails <= 0) break;

      const threadsToQueue =
        remainingEmails === undefined
          ? threadsWithoutPlan
          : threadsWithoutPlan.slice(0, remainingEmails);

      if (completeIfCancelled()) return;

      onThreadsQueued(threadsToQueue);
      totalProcessed += threadsToQueue.length;
      runAiRules(emailAccountId, threadsToQueue, false);

      if (maxEmails !== undefined && totalProcessed >= maxEmails) break;
      if (!nextPageToken) break;

      await sleep(threadsToQueue.length ? 5000 : 2000);
    }

    onComplete("success", totalProcessed);
  }

  function completeIfCancelled() {
    if (!aborted) return false;
    onComplete("cancelled", totalProcessed);
    return true;
  }

  run().catch((error) => {
    captureException(error);
    toastError({
      title: "Failed to process emails",
      description: "Please try again.",
    });
    onComplete("error", totalProcessed);
  });

  return abort;
}
