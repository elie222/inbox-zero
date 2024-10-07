"use client";

import { atomWithStorage } from "jotai/utils";
import { jotaiStore } from "@/store";
import { emailActionQueue } from "@/utils/queue/email-action-queue";
import {
  archiveThreadAction,
  trashThreadAction,
  markReadThreadAction,
} from "@/utils/actions/mail";

type QueueType = "archive" | "delete" | "markRead";

type QueueState = {
  activeThreadIds: Record<string, boolean>;
  totalThreads: number;
};

const initialQueueState: QueueState = {
  activeThreadIds: {},
  totalThreads: 0,
};

// Create atoms with localStorage persistence for each queue type
export const queueAtoms = {
  archive: atomWithStorage("archiveQueue", initialQueueState),
  delete: atomWithStorage("deleteQueue", initialQueueState),
  markRead: atomWithStorage("markReadQueue", initialQueueState),
};

type ActionFunction = (threadId: string, ...args: any[]) => Promise<any>;

const actionMap: Record<QueueType, ActionFunction> = {
  archive: archiveThreadAction,
  delete: trashThreadAction,
  markRead: (threadId: string) => markReadThreadAction(threadId, true),
};

export const addThreadsToQueue = (
  queueType: QueueType,
  threadIds: string[],
  refetch?: () => void,
) => {
  const queueAtom = queueAtoms[queueType];
  const action = actionMap[queueType];

  jotaiStore.set(queueAtom, (prev) => ({
    activeThreadIds: {
      ...prev.activeThreadIds,
      ...Object.fromEntries(threadIds.map((id) => [id, true])),
    },
    totalThreads: prev.totalThreads + threadIds.length,
  }));

  emailActionQueue.addAll(
    threadIds.map((threadId) => async () => {
      await action(threadId);

      // remove completed thread from activeThreadIds
      jotaiStore.set(queueAtom, (prev) => {
        const { [threadId]: _, ...remainingThreads } = prev.activeThreadIds;
        return {
          ...prev,
          activeThreadIds: remainingThreads,
        };
      });

      refetch?.();
    }),
  );
};

export const resetTotalThreads = (queueType: QueueType) => {
  const queueAtom = queueAtoms[queueType];
  jotaiStore.set(queueAtom, (prev) => ({
    ...prev,
    totalThreads: 0,
  }));
};
