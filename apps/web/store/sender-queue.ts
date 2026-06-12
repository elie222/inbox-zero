import { atom, useAtomValue } from "jotai";
import { jotaiStore } from "@/store";
import { isDefined } from "@/utils/types";
import { useMemo } from "react";
import { fetchAllSenderThreads } from "./fetch-sender-threads";

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
    const queueKey = getQueueKey(emailAccountId, sender);
    let isAlreadyQueued = false;

    // Add sender with pending status
    jotaiStore.set(queueAtom, (prev) => {
      // Skip if sender is already in queue
      if (prev.has(queueKey)) {
        isAlreadyQueued = true;
        return prev;
      }

      const newQueue = new Map(prev);
      newQueue.set(queueKey, {
        status: "pending",
        threadIds: [],
        threadsTotal: 0,
      });
      return newQueue;
    });

    if (isAlreadyQueued) return;

    try {
      const data = await fetchAllSenderThreads({
        sender,
        labelId: "INBOX",
        emailAccountId,
      });
      const threads = data.threads;
      const threadIds = threads
        .map((t: { id: string }) => t.id)
        .filter(isDefined);

      // Update with thread IDs
      jotaiStore.set(queueAtom, (prev) => {
        const newQueue = new Map(prev);
        newQueue.set(queueKey, {
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

      const markThreadProcessed = (threadId: string) => {
        const senderItem = jotaiStore.get(queueAtom).get(queueKey);
        if (!senderItem) return;

        // Remove processed thread from the list
        const newThreadIds = senderItem.threadIds.filter(
          (id) => id !== threadId,
        );
        // If all threads are processed, mark as completed
        const newStatus = newThreadIds.length > 0 ? "processing" : "completed";

        const updatedSender: QueueItem = {
          threadIds: newThreadIds,
          status: newStatus,
          threadsTotal: senderItem.threadsTotal,
        };

        jotaiStore.set(queueAtom, (prev) => {
          const newQueue = new Map(prev);
          newQueue.set(queueKey, updatedSender);
          return newQueue;
        });

        if (newStatus === "completed") {
          onSuccess?.(senderItem.threadsTotal);
        }
      };

      await processThreads({
        threadIds,
        labelId,
        onSuccess: (threadId) => {
          markThreadProcessed(threadId);
        },
        onError: (threadId) => {
          markThreadProcessed(threadId);
          onError?.(sender);
        },
        emailAccountId,
      });
    } catch (error) {
      // Remove sender from queue on error
      jotaiStore.set(queueAtom, (prev) => {
        const newQueue = new Map(prev);
        newQueue.delete(queueKey);
        return newQueue;
      });
      throw error;
    }
  }

  const statusAtom = atom((get) => {
    const queue = get(queueAtom);
    return (emailAccountId: string, sender: string) =>
      queue.get(getQueueKey(emailAccountId, sender));
  });

  function useSenderStatus(emailAccountId: string, sender: string) {
    const getStatus = useAtomValue(statusAtom);
    return useMemo(
      () => getStatus(emailAccountId, sender),
      [emailAccountId, getStatus, sender],
    );
  }

  return { addToQueue, useSenderStatus };
}

function getQueueKey(emailAccountId: string, sender: string) {
  return `${emailAccountId}:${sender.trim().toLowerCase()}`;
}
