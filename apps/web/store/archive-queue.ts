"use client";

import { atomWithStorage } from "jotai/utils";
import { jotaiStore } from "@/store";
import { queue } from "@/providers/p-queue";
import { archiveThreadAction } from "@/utils/actions/mail";

const initialState: {
  activeThreadIds: Record<string, boolean>;
  totalThreads: number;
} = {
  activeThreadIds: {},
  totalThreads: 0,
};

// Create atom with localStorage persistence
export const archiveQueueAtom = atomWithStorage("archiveQueue", initialState);

export const addThreadsToArchiveQueue = (
  threadIds: string[],
  refetch?: () => void,
) => {
  jotaiStore.set(archiveQueueAtom, (prev) => ({
    activeThreadIds: {
      ...prev.activeThreadIds,
      ...Object.fromEntries(threadIds.map((id) => [id, true])),
    },
    totalThreads: prev.totalThreads + threadIds.length,
  }));

  queue.addAll(
    threadIds.map((threadId) => async () => {
      await archiveThreadAction(threadId);

      // remove completed thread from activeThreadIds
      jotaiStore.set(archiveQueueAtom, (prev) => {
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

export const resetTotalThreads = () => {
  jotaiStore.set(archiveQueueAtom, (prev) => ({
    ...prev,
    totalThreads: 0,
  }));
};
