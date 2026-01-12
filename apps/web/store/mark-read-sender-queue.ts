import { atom, useAtomValue } from "jotai";
import { jotaiStore } from "@/store";
import { markReadThreads } from "./archive-queue";
import type { GetThreadsResponse } from "@/app/api/threads/basic/route";
import { isDefined } from "@/utils/types";
import { useMemo } from "react";
import { fetchWithAccount } from "@/utils/fetch";

type MarkReadStatus = "pending" | "processing" | "completed";

interface QueueItem {
  status: MarkReadStatus;
  threadIds: string[];
  threadsTotal: number;
}

const markReadSenderQueueAtom = atom<Map<string, QueueItem>>(new Map());

export async function addToMarkReadSenderQueue({
  sender,
  onSuccess,
  onError,
  emailAccountId,
}: {
  sender: string;
  onSuccess?: (totalThreads: number) => void;
  onError?: (sender: string) => void;
  emailAccountId: string;
}) {
  // Add sender with pending status
  jotaiStore.set(markReadSenderQueueAtom, (prev) => {
    // Skip if sender is already in queue
    if (prev.has(sender)) return prev;

    const newQueue = new Map(prev);
    newQueue.set(sender, { status: "pending", threadIds: [], threadsTotal: 0 });
    return newQueue;
  });

  try {
    const data = await fetchSenderThreads({
      sender,
      emailAccountId,
    });
    const threads = data.threads;
    const threadIds = threads
      .map((t: { id: string }) => t.id)
      .filter(isDefined);

    // Update with thread IDs
    jotaiStore.set(markReadSenderQueueAtom, (prev) => {
      const newQueue = new Map(prev);
      newQueue.set(sender, {
        status: threadIds.length > 0 ? "processing" : "completed",
        threadIds,
        threadsTotal: threads.length,
      });
      return newQueue;
    });

    if (threadIds.length === 0) {
      onSuccess?.(threads.length);
      return;
    }

    // Add threads to mark as read queue
    await markReadThreads({
      threadIds,
      onSuccess: (threadId) => {
        const senderItem = jotaiStore.get(markReadSenderQueueAtom).get(sender);
        if (!senderItem) return;

        // Remove marked thread from the list
        const newThreadIds = senderItem.threadIds.filter(
          (id) => id !== threadId,
        );
        // If all threads are marked as read, mark as completed
        const newStatus = newThreadIds.length > 0 ? "processing" : "completed";

        const updatedSender: QueueItem = {
          threadIds: newThreadIds,
          status: newStatus,
          threadsTotal: senderItem.threadsTotal,
        };

        jotaiStore.set(markReadSenderQueueAtom, (prev) => {
          const newQueue = new Map(prev);
          newQueue.set(sender, updatedSender);
          return newQueue;
        });

        if (newStatus === "completed") {
          onSuccess?.(senderItem.threadsTotal);
        }
      },
      onError,
      emailAccountId,
    });
  } catch (error) {
    // Remove sender from queue on error
    jotaiStore.set(markReadSenderQueueAtom, (prev) => {
      const newQueue = new Map(prev);
      newQueue.delete(sender);
      return newQueue;
    });
    throw error;
  }
}

const markReadSenderStatusAtom = atom((get) => {
  const queue = get(markReadSenderQueueAtom);
  return (sender: string) => queue.get(sender);
});

export const useMarkReadSenderStatus = (sender: string) => {
  const getStatus = useAtomValue(markReadSenderStatusAtom);
  return useMemo(() => getStatus(sender), [getStatus, sender]);
};

async function fetchSenderThreads({
  sender,
  emailAccountId,
}: {
  sender: string;
  emailAccountId: string;
}) {
  const url = `/api/threads/basic?fromEmail=${encodeURIComponent(sender)}&labelId=INBOX`;
  const res = await fetchWithAccount({ url, emailAccountId });

  if (!res.ok) throw new Error("Failed to fetch threads");

  const data: GetThreadsResponse = await res.json();

  return data;
}
