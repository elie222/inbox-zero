"use client";

import { atom, useAtomValue } from "jotai";
import { useCallback, useMemo } from "react";
import type { GetThreadsResponse } from "@/app/api/threads/basic/route";
import { jotaiStore } from "@/store";
import { fetchWithAccount } from "@/utils/fetch";
import { isDefined } from "@/utils/types";
import { archiveEmails } from "./archive-queue";

type QueueStatus = "pending" | "processing" | "completed" | "failed";

type QueueItem = {
  status: QueueStatus;
  threadIds: string[];
  threadsTotal: number;
};

type QueueProgress = {
  totalItems: number;
  completedItems: number;
};

const queueAtom = atom<Map<string, QueueItem>>(new Map());

const statusAtom = atom((get) => {
  const queue = get(queueAtom);
  return (emailAccountId: string, sender: string) =>
    queue.get(getQueueKey(emailAccountId, sender));
});

const progressAtom = atom((get) => {
  const queue = get(queueAtom);
  return (emailAccountId: string): QueueProgress | undefined => {
    let totalItems = 0;
    let completedItems = 0;

    for (const [queueKey, item] of queue.entries()) {
      if (!queueKey.startsWith(`${emailAccountId}:`)) continue;

      totalItems += 1;
      if (item.status === "completed" || item.status === "failed") {
        completedItems += 1;
      }
    }

    if (!totalItems) return undefined;

    return { totalItems, completedItems };
  };
});

export async function addToArchiveSenderThreadQueue({
  sender,
  labelId,
  emailAccountId,
}: {
  sender: string;
  labelId?: string;
  emailAccountId: string;
}) {
  const queueKey = getQueueKey(emailAccountId, sender);

  jotaiStore.set(queueAtom, (prev) => {
    const next = new Map(prev);
    const existingItem = next.get(queueKey);
    if (existingItem && existingItem.status !== "failed") return prev;

    next.set(queueKey, {
      status: "pending",
      threadIds: [],
      threadsTotal: 0,
    });
    return next;
  });

  try {
    const data = await fetchSenderThreads({
      sender,
      emailAccountId,
    });
    const threads = data.threads;
    const threadIds = threads
      .map((thread: { id: string }) => thread.id)
      .filter(isDefined);

    jotaiStore.set(queueAtom, (prev) => {
      const next = new Map(prev);
      next.set(queueKey, {
        status: threadIds.length > 0 ? "processing" : "completed",
        threadIds,
        threadsTotal: threads.length,
      });
      return next;
    });

    if (!threadIds.length) return;

    await archiveEmails({
      threadIds,
      labelId,
      emailAccountId,
      onSuccess: (threadId) => {
        markThreadProcessed({
          emailAccountId,
          sender,
          threadId,
        });
      },
      onError: (threadId) => {
        markThreadProcessed({
          emailAccountId,
          sender,
          threadId,
        });
      },
    });
  } catch (error) {
    jotaiStore.set(queueAtom, (prev) => {
      const next = new Map(prev);
      const existingItem = next.get(queueKey);
      next.set(queueKey, {
        status: "failed",
        threadIds: existingItem?.threadIds ?? [],
        threadsTotal: existingItem?.threadsTotal ?? 0,
      });
      return next;
    });
    throw error;
  }
}

export function useArchiveSenderQueueActions(emailAccountId: string) {
  const getProgress = useAtomValue(progressAtom);
  const progress = getProgress(emailAccountId);

  const queueArchiveSenders = useCallback(
    async ({ senders }: { senders: string[] }) => {
      const uniqueSenders = getUniqueSenders(senders);
      let queuedSenders = 0;

      for (const sender of uniqueSenders) {
        if (hasQueuedSender(emailAccountId, sender)) continue;

        await addToArchiveSenderThreadQueue({
          sender,
          emailAccountId,
        });
        queuedSenders += 1;
      }

      return queuedSenders;
    },
    [emailAccountId],
  );

  return useMemo(
    () => ({
      queueArchiveSenders,
      isQueueArchiving: Boolean(
        progress && progress.completedItems < progress.totalItems,
      ),
    }),
    [progress, queueArchiveSenders],
  );
}

export function useArchiveSenderStatus(emailAccountId: string, sender: string) {
  const getStatus = useAtomValue(statusAtom);

  return useMemo(
    () => getStatus(emailAccountId, sender),
    [emailAccountId, getStatus, sender],
  );
}

export function useArchiveQueueProgress(emailAccountId: string) {
  const getProgress = useAtomValue(progressAtom);

  return useMemo(
    () => getProgress(emailAccountId),
    [emailAccountId, getProgress],
  );
}

export function clearArchiveSenderStatuses(emailAccountId: string) {
  jotaiStore.set(queueAtom, (prev) => {
    const next = new Map(prev);

    for (const queueKey of next.keys()) {
      if (!queueKey.startsWith(`${emailAccountId}:`)) continue;
      next.delete(queueKey);
    }

    return next;
  });
}

function markThreadProcessed({
  emailAccountId,
  sender,
  threadId,
}: {
  emailAccountId: string;
  sender: string;
  threadId: string;
}) {
  const queueKey = getQueueKey(emailAccountId, sender);

  jotaiStore.set(queueAtom, (prev) => {
    const queueItem = prev.get(queueKey);
    if (!queueItem) return prev;

    const nextThreadIds = queueItem.threadIds.filter((id) => id !== threadId);
    const next = new Map(prev);

    next.set(queueKey, {
      ...queueItem,
      threadIds: nextThreadIds,
      status: nextThreadIds.length ? "processing" : "completed",
    });

    return next;
  });
}

function hasQueuedSender(emailAccountId: string, sender: string) {
  const queueItem = jotaiStore
    .get(queueAtom)
    .get(getQueueKey(emailAccountId, sender));
  return Boolean(queueItem && queueItem.status !== "failed");
}

function getUniqueSenders(senders: string[]) {
  const uniqueSenders = new Map<string, string>();

  for (const sender of senders) {
    const normalizedSender = normalizeSender(sender);
    if (!normalizedSender || uniqueSenders.has(normalizedSender)) continue;

    uniqueSenders.set(normalizedSender, sender.trim());
  }

  return Array.from(uniqueSenders.values());
}

function getQueueKey(emailAccountId: string, sender: string) {
  return `${emailAccountId}:${normalizeSender(sender)}`;
}

function normalizeSender(sender: string) {
  return sender.trim().toLowerCase();
}

async function fetchSenderThreads({
  sender,
  emailAccountId,
}: {
  sender: string;
  emailAccountId: string;
}) {
  const url = `/api/threads/basic?fromEmail=${encodeURIComponent(sender)}&labelId=INBOX`;
  const response = await fetchWithAccount({ url, emailAccountId });

  if (!response.ok) {
    throw new Error("Failed to fetch threads");
  }

  const data: GetThreadsResponse = await response.json();

  return data;
}
