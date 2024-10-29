import { atom } from "jotai";
import { jotaiStore } from "@/store";
import { archiveEmails } from "./archive-queue";
import { GetThreadsResponse } from "@/app/api/google/threads/basic/route";
import { isDefined } from "@/utils/types";

type ArchiveStatus = "pending" | "processing" | "completed";

interface QueueItem {
  status: ArchiveStatus;
  threadIds: string[];
  threadsTotal: number;
}

export const archiveSenderQueueAtom = atom<Map<string, QueueItem>>(new Map());

export async function addToArchiveSenderQueue(sender: string) {
  // Add sender with pending status
  jotaiStore.set(archiveSenderQueueAtom, (prev) => {
    // Skip if sender is already in queue
    if (prev.has(sender)) return prev;

    const newQueue = new Map(prev);
    newQueue.set(sender, { status: "pending", threadIds: [], threadsTotal: 0 });
    return newQueue;
  });

  try {
    const threads = await fetchSenderThreads(sender);
    const threadIds = threads.map((t) => t.id).filter(isDefined);

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

    // Add threads to archive queue
    await archiveEmails(threadIds, (threadId) => {
      const senderItem = jotaiStore.get(archiveSenderQueueAtom).get(sender);
      if (!senderItem) return;

      // Remove archived thread from the list
      const newThreadIds = senderItem.threadIds.filter((id) => id !== threadId);

      const updatedSender: QueueItem = {
        threadIds: newThreadIds,
        // If all threads are archived, mark as completed
        status: newThreadIds.length > 0 ? "processing" : "completed",
        threadsTotal: senderItem.threadsTotal,
      };

      jotaiStore.set(archiveSenderQueueAtom, (prev) => {
        const newQueue = new Map(prev);
        newQueue.set(sender, updatedSender);
        return newQueue;
      });
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

export const createArchiveSenderStatusAtom = (sender: string) =>
  atom((get) => {
    const queue = get(archiveSenderQueueAtom);
    const item = queue.get(sender);
    return item;
  });

async function fetchSenderThreads(sender: string) {
  const url = `/api/google/threads/basic?from=${encodeURIComponent(sender)}&labelId=INBOX`;
  const res = await fetch(url);

  if (!res.ok) throw new Error("Failed to fetch threads");

  const data: GetThreadsResponse = await res.json();

  return data;
}
