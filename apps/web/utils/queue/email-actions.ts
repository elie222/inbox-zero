"use client";

import { runRulesAction } from "@/utils/actions/ai-rule";
import { pushToAiQueueAtom, removeFromAiQueueAtom } from "@/store/ai-queue";
import { isDefined } from "@/utils/types";
import { aiQueue } from "@/utils/queue/ai-queue";

export const runAiRules = async (
  emailAccountId: string,
  threadsArray: Array<
    { id: string; messages: Array<{ id: string }> } | null | undefined
  >,
  rerun: boolean,
  {
    signal,
    skipDraftReplies = false,
    runWithRetry = (operation) => operation(),
  }: {
    signal?: AbortSignal;
    skipDraftReplies?: boolean;
    // Retrying inside the task keeps a rate-limited email queued, and retries
    // only that email, instead of failing the batch.
    runWithRetry?: <T>(
      operation: () => Promise<T>,
      signal: AbortSignal,
    ) => Promise<T>;
  } = {},
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
              const message = thread.messages.at(-1);
              if (!message) return;

              let isRetry = false;
              await runWithRetry(async () => {
                // A failed attempt may already have saved a result and run
                // some actions. Retrying as a rerun would discard it and run
                // them again, so retries keep whatever the attempt saved.
                const rerunThisAttempt = rerun && !isRetry;
                isRetry = true;
                const result = await runRulesAction(emailAccountId, {
                  messageId: message.id,
                  threadId: thread.id,
                  rerun: rerunThisAttempt,
                  isTest: false,
                  skipDraftReplies,
                });

                if (result?.serverError) throw new Error(result.serverError);
              }, batchAbortController.signal);
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
