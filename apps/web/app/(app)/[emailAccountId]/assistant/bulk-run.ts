import { addDays } from "date-fns/addDays";
import { startOfDay } from "date-fns/startOfDay";
import type { I18n } from "@lingui/core";
import { plural, t } from "@lingui/core/macro";
import type { ThreadsResponse } from "@/app/api/threads/route";
import type { ThreadsQuery } from "@/utils/threads/validation";
import { runAiRules } from "@/utils/queue/email-actions";
import {
  resetAiQueueConcurrency,
  slowDownAiQueue,
} from "@/utils/queue/ai-queue";
import { sleep } from "@/utils/sleep";
import { toastError } from "@/components/Toast";
import { captureException } from "@/utils/error";
import { fetchWithAccount } from "@/utils/fetch";
import { createSearchParams } from "@/utils/url";
import { getRetryAfterDelayMs } from "@/utils/retry/provider-retry";
import {
  BulkRunRateLimitGiveUpError,
  BulkRunRequestError,
  createBulkRunRetrier,
} from "@/app/(app)/[emailAccountId]/assistant/bulk-run-retry";

const BATCH_SIZE = 25;

export async function onRun(
  emailAccountId: string,
  {
    startDate,
    endDate,
    includeRead,
    generateDraftReplies = false,
    rerun,
    maxEmails,
    i18n,
  }: {
    startDate: Date;
    endDate?: Date;
    includeRead?: boolean;
    generateDraftReplies?: boolean;
    rerun?: boolean;
    maxEmails?: number;
    i18n: I18n;
  },
  onThreadsQueued: (threads: ThreadsResponse["threads"]) => void,
  onComplete: (
    status: "success" | "error" | "cancelled",
    count: number,
  ) => void,
  onRateLimitWait?: (resumeAt: Date | null) => void,
) {
  let nextPageToken = "";
  let totalProcessed = 0;
  let completedInBatch = 0;
  let aborted = false;
  const abortController = new AbortController();
  // Provider "before" filters are exclusive; the selected calendar day is inclusive.
  const before = endDate ? startOfDay(addDays(endDate, 1)) : undefined;
  const retrier = createBulkRunRetrier({
    onWaiting: (resumeAt) => onRateLimitWait?.(resumeAt),
    // Fewer emails in flight keeps the run from immediately re-triggering the limit.
    onRateLimited: slowDownAiQueue,
  });

  function abort() {
    aborted = true;
    abortController.abort();
  }

  async function fetchThreadsPage(): Promise<ThreadsResponse> {
    const query: ThreadsQuery = {
      type: "inbox",
      limit: BATCH_SIZE,
      after: startDate,
      ...(before ? { before } : {}),
      ...(!includeRead ? { isUnread: true } : {}),
      ...(nextPageToken ? { nextPageToken } : {}),
    };

    const response = await fetchWithAccount({
      url: `/api/threads?${createSearchParams(query).toString()}`,
      emailAccountId,
      init: { signal: abortController.signal },
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new BulkRunRequestError({
        status: response.status,
        message:
          typeof errorData.error === "string"
            ? errorData.error
            : `Error: ${response.status}`,
        retryAfterMs: getRetryAfterDelayMs(
          response.headers?.get("Retry-After") ?? undefined,
        ),
      });
    }

    return response.json();
  }

  async function run() {
    while (true) {
      if (completeIfCancelled()) return;

      let data: ThreadsResponse;
      try {
        data = await retrier.run(fetchThreadsPage, abortController.signal);
      } catch (error) {
        if (completeIfCancelled()) return;
        if (error instanceof BulkRunRequestError) {
          toastError({
            title: t(i18n)`Failed to fetch emails`,
            description: error.message,
          });
          onComplete("error", totalProcessed);
          return;
        }
        throw error;
      }

      if (completeIfCancelled()) return;

      if (!data.threads) {
        toastError({
          title: t(i18n)`Invalid response`,
          description: t(i18n)`Failed to process emails. Please try again.`,
        });
        onComplete("error", totalProcessed);
        return;
      }

      nextPageToken = data.nextPageToken || "";

      const eligibleThreads = rerun
        ? data.threads
        : data.threads.filter((thread) => !thread.plan);
      const remainingEmails =
        maxEmails === undefined ? undefined : maxEmails - totalProcessed;
      if (remainingEmails !== undefined && remainingEmails <= 0) break;

      const threadsToQueue =
        remainingEmails === undefined
          ? eligibleThreads
          : eligibleThreads.slice(0, remainingEmails);

      if (completeIfCancelled()) return;

      onThreadsQueued(threadsToQueue);
      await runAiRules(emailAccountId, threadsToQueue, !!rerun, {
        signal: abortController.signal,
        skipDraftReplies: !generateDraftReplies,
        runWithRetry: async (operation, signal) => {
          const result = await retrier.run(operation, signal);
          completedInBatch += 1;
          return result;
        },
      });
      totalProcessed += threadsToQueue.length;
      completedInBatch = 0;

      if (maxEmails !== undefined && totalProcessed >= maxEmails) break;
      if (!nextPageToken) break;

      if (threadsToQueue.length === 0) {
        await sleep(2000);
      }
    }

    onComplete("success", totalProcessed);
  }

  function completeIfCancelled() {
    if (!aborted) return false;
    onComplete("cancelled", totalProcessed);
    return true;
  }

  run()
    .catch((error) => {
      if (completeIfCancelled()) return;

      abortController.abort();
      const processedCount = totalProcessed + completedInBatch;
      if (error instanceof BulkRunRateLimitGiveUpError) {
        toastError({
          title: t(i18n)`Processing stopped`,
          description: rerun
            ? t(
                i18n,
              )`${plural(processedCount, { one: "Your email provider kept limiting requests, so processing stopped after # email. Run it again later to try again.", other: "Your email provider kept limiting requests, so processing stopped after # emails. Run it again later to try again." })}`
            : t(
                i18n,
              )`${plural(processedCount, { one: "Your email provider kept limiting requests, so processing stopped after # email. Run it again later to continue with the rest.", other: "Your email provider kept limiting requests, so processing stopped after # emails. Run it again later to continue with the rest." })}`,
        });
      } else {
        captureException(error);
        toastError({
          title: t(i18n)`Failed to process emails`,
          description:
            error instanceof Error ? error.message : t(i18n)`Please try again.`,
        });
      }
      onComplete("error", processedCount);
    })
    .finally(() => {
      onRateLimitWait?.(null);
      resetAiQueueConcurrency();
    });

  return abort;
}
