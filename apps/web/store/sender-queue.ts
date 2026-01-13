import { atom, useAtomValue } from "jotai";
import { jotaiStore } from "@/store";
import type { GetThreadsResponse } from "@/app/api/threads/basic/route";
import { isDefined } from "@/utils/types";
import { useMemo } from "react";
import { fetchWithAccount } from "@/utils/fetch";

type QueueStatus = "pending" | "processing" | "completed";

interface QueueItem {
  status: QueueStatus;
  threadIds: string[];
  threadsTotal: number;
}

type ProcessThreadsFn = (params: {
  threadIds: string[];
  labelId?: string;
  onSuccess: (threadId: string) => void;
  onError?: (threadId: string) => void;
  emailAccountId: string;
}) => Promise<void>;

export function createSenderQueue(processThreads: ProcessThreadsFn) {
  const queueAtom = atom<Map<string, QueueItem>>(new Map());

  async function addToQueue({
    sender,
    labelId,
    onSuccess,
    onError,
    emailAccountId,
  }: {
    sender: string;
    labelId?: string;
    onSuccess?: (totalThreads: number) => void;
    onError?: (sender: string) => void;
    emailAccountId: string;
  }) {
    // Add sender with pending status
    jotaiStore.set(queueAtom, (prev) => {
      // Skip if sender is already in queue
      if (prev.has(sender)) return prev;

      const newQueue = new Map(prev);
      newQueue.set(sender, {
        status: "pending",
        threadIds: [],
        threadsTotal: 0,
      });
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
      jotaiStore.set(queueAtom, (prev) => {
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

      // Process threads
      await processThreads({
        threadIds,
        labelId,
        onSuccess: (threadId) => {
          const senderItem = jotaiStore.get(queueAtom).get(sender);
          if (!senderItem) return;

          // Remove processed thread from the list
          const newThreadIds = senderItem.threadIds.filter(
            (id) => id !== threadId,
          );
          // If all threads are processed, mark as completed
          const newStatus =
            newThreadIds.length > 0 ? "processing" : "completed";

          const updatedSender: QueueItem = {
            threadIds: newThreadIds,
            status: newStatus,
            threadsTotal: senderItem.threadsTotal,
          };

          jotaiStore.set(queueAtom, (prev) => {
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
      jotaiStore.set(queueAtom, (prev) => {
        const newQueue = new Map(prev);
        newQueue.delete(sender);
        return newQueue;
      });
      throw error;
    }
  }

  const statusAtom = atom((get) => {
    const queue = get(queueAtom);
    return (sender: string) => queue.get(sender);
  });

  function useSenderStatus(sender: string) {
    const getStatus = useAtomValue(statusAtom);
    return useMemo(() => getStatus(sender), [getStatus, sender]);
  }

  return { addToQueue, useSenderStatus };
}

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
