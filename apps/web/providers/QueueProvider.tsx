"use client";

import { useEffect } from "react";
import PQueue from "p-queue";
import uniqBy from "lodash/uniqBy";
import { runAiAction } from "@/utils/actions";
import {
  archiveThreadAction,
  markReadThreadAction,
  trashThreadAction,
} from "@/utils/actions/mail";
import { ActBodyWithHtml } from "@/app/api/ai/act/validation";
import { pushToAiQueueAtom, removeFromAiQueueAtom } from "@/store/queue";
import { type Thread } from "@/components/email-list/types";

const queue = new PQueue({ concurrency: 3 });

type QueueNameLocalStorage =
  | "archiveQueue"
  | "deleteQueue"
  | "markReadQueue"
  | "aiRuleQueue";

export const archiveEmails = async (
  threadIds: string[],
  refetch: () => void,
) => {
  updateQueueStorage("archiveQueue", threadIds, "pending");

  queue.addAll(
    threadIds.map((threadId) => async () => {
      await archiveThreadAction(threadId);
      updateQueueStorage("archiveQueue", [threadId], "complete");
      refetch();
    }),
  );
};

export const deleteEmails = async (
  threadIds: string[],
  refetch: () => void,
) => {
  queue.addAll(
    threadIds.map((threadId) => async () => {
      trashThreadAction(threadId);
      refetch();
    }),
  );
};

export const markReadThreads = async (
  threadIds: string[],
  read: boolean,
  refetch: () => void,
) => {
  queue.addAll(
    threadIds.map((threadId) => async () => {
      await markReadThreadAction(threadId, read);
      refetch();
    }),
  );
};

export const runAiRules = async (
  threads: Thread[],
  // refetch: () => void,
) => {
  // updateRunAiQueueStorage(threads, "pending");

  pushToAiQueueAtom(threads.map((t) => t.id));

  queue.addAll(
    threads.map((thread) => async () => {
      const message = threadToRunAiEmail(thread);
      if (!message) return;
      console.log("runAiRules on thread:", message.subject);
      await runAiAction(message);
      removeFromAiQueueAtom(thread.id);
      // updateRunAiQueueStorage([thread], "complete");
      // refetch();
    }),
  );
};

function threadToRunAiEmail(
  thread: Thread,
): ActBodyWithHtml["email"] | undefined {
  const message = thread.messages?.[thread.messages.length - 1];
  if (!message) return;
  const email = {
    from: message.headers.from,
    to: message.headers.to,
    date: message.headers.date,
    replyTo: message.headers["reply-to"],
    cc: message.headers.cc,
    subject: message.headers.subject,
    textPlain: message.textPlain || null,
    textHtml: message.textHtml || null,
    snippet: thread.snippet,
    threadId: message.threadId || "",
    messageId: message.id || "",
    headerMessageId: message.headers["message-id"] || "",
    references: message.headers.references,
  };
  return email;
}

export function QueueProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    const pendingArchive = getPendingEmails("archiveQueue");
    if (pendingArchive) archiveEmails(pendingArchive, () => {});

    const pendingMarkRead = getPendingEmails("markReadQueue");
    if (pendingMarkRead) archiveEmails(pendingMarkRead, () => {});

    const pendingDelete = getPendingEmails("deleteQueue");
    if (pendingDelete) archiveEmails(pendingDelete, () => {});

    const pendingAi = getPendingEmails("aiRuleQueue");
    if (pendingAi) archiveEmails(pendingAi, () => {});
  }, []);

  return <>{children}</>;
}

function updateQueueStorage(
  name: QueueNameLocalStorage,
  threadIds: string[],
  state: "pending" | "complete",
) {
  const currentStateString = localStorage.getItem(name);

  if (currentStateString) {
    const currentState: string[] = JSON.parse(currentStateString);
    const updatedState: string[] =
      state === "pending"
        ? Array.from(new Set([...currentState, ...threadIds]))
        : currentState.filter((id: string) => !threadIds.includes(id));
    localStorage.setItem(name, JSON.stringify(updatedState));
  } else {
    return localStorage.setItem(name, JSON.stringify(threadIds));
  }
}

// Copy and paste of the above. Might be able to refactor to use a generic
function updateRunAiQueueStorage(
  threads: ActBodyWithHtml["email"][],
  state: "pending" | "complete",
) {
  const name: QueueNameLocalStorage = "aiRuleQueue";
  const currentStateString = localStorage.getItem(name);

  if (currentStateString) {
    const currentState: ActBodyWithHtml["email"][] =
      JSON.parse(currentStateString);
    const updatedState: ActBodyWithHtml["email"][] =
      state === "pending"
        ? uniqBy([...currentState, ...threads], (t) => t.threadId)
        : currentState.filter(
            ({ threadId }) => !threads.find((t) => t.threadId === threadId),
          );
    localStorage.setItem(name, JSON.stringify(updatedState));
  } else {
    return localStorage.setItem(name, JSON.stringify(threads));
  }
}

function getPendingEmails(name: QueueNameLocalStorage) {
  const currentStateString = localStorage.getItem(name);
  if (!currentStateString) return;

  const currentState = JSON.parse(currentStateString);
  if (!currentState.length) return;

  return currentState;
}
