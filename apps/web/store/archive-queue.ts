import { atomWithStorage, createJSONStorage } from "jotai/utils";
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

function getInitialState(): QueueState {
  return { activeThreadIds: {}, totalThreads: 0 };
}

// some users were somehow getting null for activeThreadIds, this should fix it
const createStorage = () => {
  const storage = createJSONStorage<QueueState>(() => localStorage);
  return {
    ...storage,
    getItem: (key: string, initialValue: QueueState) => {
      const storedValue = storage.getItem(key, initialValue);
      return {
        activeThreadIds: storedValue.activeThreadIds || {},
        totalThreads: storedValue.totalThreads || 0,
      };
    },
  };
};

// Create atoms with localStorage persistence for each queue type
export const queueAtoms = {
  archive: atomWithStorage("archiveQueue", getInitialState(), createStorage()),
  delete: atomWithStorage("deleteQueue", getInitialState(), createStorage()),
  markRead: atomWithStorage(
    "markReadQueue",
    getInitialState(),
    createStorage(),
  ),
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

  jotaiStore.set(queueAtom, (prev) => ({
    activeThreadIds: {
      ...prev.activeThreadIds,
      ...Object.fromEntries(threadIds.map((id) => [id, true])),
    },
    totalThreads: prev.totalThreads + threadIds.length,
  }));

  processQueue(queueType, threadIds, refetch);
};

export function processQueue(
  queueType: QueueType,
  threadIds: string[],
  refetch?: () => void,
) {
  const queueAtom = queueAtoms[queueType];
  const action = actionMap[queueType];

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
}

export const resetTotalThreads = (queueType: QueueType) => {
  const queueAtom = queueAtoms[queueType];
  jotaiStore.set(queueAtom, (prev) => ({
    ...prev,
    totalThreads: 0,
  }));
};
