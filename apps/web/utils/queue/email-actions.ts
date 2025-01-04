"use client";

import { runRulesAction } from "@/utils/actions/ai-rule";
import type { EmailForAction } from "@/utils/ai/actions";
import { pushToAiQueueAtom, removeFromAiQueueAtom } from "@/store/ai-queue";
import type { Thread } from "@/components/email-list/types";
import { isDefined } from "@/utils/types";
import { aiQueue } from "@/utils/queue/ai-queue";

export const runAiRules = async (threadsArray: Thread[], force: boolean) => {
  const threads = threadsArray.filter(isDefined);
  const threadIds = threads.map((t) => t.id);
  pushToAiQueueAtom(threadIds);

  aiQueue.addAll(
    threads.map((thread) => async () => {
      const email = threadToRunRulesEmail(thread);
      if (!email) return;
      await runRulesAction({ email, force, isTest: false });
      removeFromAiQueueAtom(thread.id);
    }),
  );
};

function threadToRunRulesEmail(thread: Thread): EmailForAction | undefined {
  const message = thread.messages?.[thread.messages.length - 1];
  if (!message) return;
  const email: EmailForAction = {
    from: message.headers.from,
    replyTo: message.headers["reply-to"],
    subject: message.headers.subject,
    threadId: message.threadId || "",
    messageId: message.id || "",
    headerMessageId: message.headers["message-id"] || "",
    references: message.headers.references,
  };

  return email;
}
