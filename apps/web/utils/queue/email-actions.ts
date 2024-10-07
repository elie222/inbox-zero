"use client";

import { runRulesAction } from "@/utils/actions/ai-rule";
import type { EmailForAction } from "@/utils/ai/actions";
import { pushToAiQueueAtom, removeFromAiQueueAtom } from "@/store/queue";
import { addThreadsToQueue } from "@/store/archive-queue";
import type { Thread } from "@/components/email-list/types";
import type { GetThreadsResponse } from "@/app/api/google/threads/basic/route";
import { isDefined } from "@/utils/types";
import { emailActionQueue } from "@/utils/queue/p-queue";

export const archiveEmails = async (
  threadIds: string[],
  refetch?: () => void,
) => {
  addThreadsToQueue("archive", threadIds, refetch);
};

export const markReadThreads = async (
  threadIds: string[],
  refetch: () => void,
) => {
  addThreadsToQueue("markRead", threadIds, refetch);
};

export const deleteEmails = async (
  threadIds: string[],
  refetch: () => void,
) => {
  addThreadsToQueue("delete", threadIds, refetch);
};

export const archiveAllSenderEmails = async (
  from: string,
  onComplete: () => void,
) => {
  // 1. search gmail for messages from sender
  const url = `/api/google/threads/basic?from=${from}&labelId=INBOX`;
  const res = await fetch(url);
  const data: GetThreadsResponse = await res.json();

  // 2. archive messages
  if (data?.length) {
    archiveEmails(data.map((t) => t.id).filter(isDefined), onComplete);
  } else {
    onComplete();
  }

  return data;
};

export const runAiRules = async (threads: Thread[], force: boolean) => {
  pushToAiQueueAtom(threads.map((t) => t.id));

  emailActionQueue.addAll(
    threads.map((thread) => async () => {
      const message = threadToRunRulesEmail(thread);
      if (!message) return;
      await runRulesAction(message, force);
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
