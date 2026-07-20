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

  return aiQueue.addAll(
    threads.map((thread) => async () => {
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
      } finally {
        removeFromAiQueueAtom(thread.id);
      }
    }),
    { signal },
  );
};
