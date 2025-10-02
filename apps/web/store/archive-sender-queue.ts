import { atom, useAtomValue } from "jotai";
import { jotaiStore } from "@/store";
import { archiveEmails } from "./archive-queue";
import type { GetThreadsResponse } from "@/app/api/threads/basic/route";
import { isDefined } from "@/utils/types";
import { useMemo } from "react";
import { fetchWithAccount } from "@/utils/fetch";

type ArchiveStatus = "pending" | "processing" | "completed";

interface QueueItem {
  status: ArchiveStatus;
  threadIds: string[];
  threadsTotal: number;
}

const archiveSenderQueueAtom = atom<Map<string, QueueItem>>(new Map());

export async function addToArchiveSenderQueue({
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
  jotaiStore.set(archiveSenderQueueAtom, (prev) => {
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
    jotaiStore.set(archiveSenderQueueAtom, (prev) => {
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

    // Add threads to archive queue
    await archiveEmails({
      threadIds,
      labelId,
      onSuccess: (threadId) => {
        const senderItem = jotaiStore.get(archiveSenderQueueAtom).get(sender);
        if (!senderItem) return;

        // Remove archived thread from the list
        const newThreadIds = senderItem.threadIds.filter(
          (id) => id !== threadId,
        );
        // If all threads are archived, mark as completed
        const newStatus = newThreadIds.length > 0 ? "processing" : "completed";

        const updatedSender: QueueItem = {
          threadIds: newThreadIds,
          status: newStatus,
          threadsTotal: senderItem.threadsTotal,
        };

        jotaiStore.set(archiveSenderQueueAtom, (prev) => {
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
    jotaiStore.set(archiveSenderQueueAtom, (prev) => {
      const newQueue = new Map(prev);
      newQueue.delete(sender);
      return newQueue;
    });
    throw error;
  }
}

const archiveSenderStatusAtom = atom((get) => {
  const queue = get(archiveSenderQueueAtom);
  return (sender: string) => queue.get(sender);
});

export const useArchiveSenderStatus = (sender: string) => {
  const getStatus = useAtomValue(archiveSenderStatusAtom);
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
