"use client";

import { runRulesAction } from "@/utils/actions/ai-rule";
import { pushToAiQueueAtom, removeFromAiQueueAtom } from "@/store/ai-queue";
import { isDefined } from "@/utils/types";
import { aiQueue } from "@/utils/queue/ai-queue";
import type { ThreadsResponse } from "@/app/api/threads/route";

export const runAiRules = async (
  emailAccountId: string,
  threadsArray: ThreadsResponse["threads"],
  rerun: boolean,
  signal?: AbortSignal,
) => {
  const threads = threadsArray.filter(isDefined);
  const threadIds = threads.map((t) => t.id);
  pushToAiQueueAtom(threadIds);

  const batchAbortController = new AbortController();
  const abortBatch = () => {
    batchAbortController.abort(
      signal?.reason ?? new DOMException("Aborted", "AbortError"),
    );
  };

  if (signal?.aborted) {
    abortBatch();
  } else {
    signal?.addEventListener("abort", abortBatch, { once: true });
  }

  let firstError: unknown;
  let hasTaskFailure = false;

  try {
    const taskPromises = threads.map((thread) =>
      aiQueue
        .add(
          async () => {
            try {
              const message = thread.messages?.[thread.messages.length - 1];
              if (!message) return;

              const result = await runRulesAction(emailAccountId, {
                messageId: message.id,
                threadId: thread.id,
                rerun,
                isTest: false,
              });

              if (result?.serverError) throw new Error(result.serverError);
            } catch (error) {
              if (!batchAbortController.signal.aborted) {
                firstError = error;
                hasTaskFailure = true;
                batchAbortController.abort(error);
              }

              throw error;
            }
          },
          { signal: batchAbortController.signal },
        )
        .finally(() => {
          removeFromAiQueueAtom(thread.id);
        }),
    );

    const results = await Promise.allSettled(taskPromises);

    if (hasTaskFailure) throw firstError;
    if (signal?.aborted) {
      throw signal.reason ?? new DOMException("Aborted", "AbortError");
    }

    return results.map((result) => {
      if (result.status === "rejected") throw result.reason;
      return result.value;
    });
  } finally {
    signal?.removeEventListener("abort", abortBatch);
  }
};
