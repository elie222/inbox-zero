import { atomWithStorage, createJSONStorage } from "jotai/utils";
import pRetry from "p-retry";
import { jotaiStore } from "@/store";
import { emailActionQueue } from "@/utils/queue/email-action-queue";
import {
  archiveThreadAction,
  trashThreadAction,
  markReadThreadAction,
} from "@/utils/actions/mail";
import { isActionError, ServerActionResponse } from "@/utils/error";
import { exponentialBackoff, sleep } from "@/utils/sleep";

type ActionType = "archive" | "delete" | "markRead";

type QueueItem = {
  threadId: string;
  actionType: ActionType;
  labelId?: string;
};

type QueueState = {
  activeThreads: Record<`${ActionType}-${string}`, QueueItem>;
  totalThreads: number;
};

// some users were somehow getting null for activeThreads, this should fix it
const createStorage = () => {
  if (typeof window === "undefined") return;
  const storage = createJSONStorage<QueueState>(() => localStorage);
  return {
    ...storage,
    getItem: (key: string, initialValue: QueueState) => {
      const storedValue = storage.getItem(key, initialValue);
      return {
        activeThreads: storedValue.activeThreads || {},
        totalThreads: storedValue.totalThreads || 0,
      };
    },
  };
};

// Create atoms with localStorage persistence
export const queueAtom = atomWithStorage(
  "gmailActionQueue",
  { activeThreads: {}, totalThreads: 0 },
  createStorage(),
  { getOnInit: true },
);

type ActionFunction = (
  threadId: string,
  labelId?: string,
) => Promise<ServerActionResponse<{}>>;

const actionMap: Record<ActionType, ActionFunction> = {
  archive: (threadId: string, labelId?: string) =>
    archiveThreadAction(threadId, labelId),
  delete: trashThreadAction,
  markRead: (threadId: string) => markReadThreadAction(threadId, true),
};

export const addThreadsToQueue = ({
  actionType,
  threadIds,
  labelId,
  refetch,
}: {
  actionType: ActionType;
  threadIds: string[];
  labelId?: string;
  refetch?: () => void;
}) => {
  const threads = Object.fromEntries(
    threadIds.map((threadId) => [
      `${actionType}-${threadId}`,
      { threadId, actionType, labelId },
    ]),
  );

  jotaiStore.set(queueAtom, (prev) => ({
    activeThreads: {
      ...prev.activeThreads,
      ...threads,
    },
    totalThreads: prev.totalThreads + Object.keys(threads).length,
  }));

  processQueue({ threads, refetch });
};

function removeThreadFromQueue(threadId: string, actionType: ActionType) {
  jotaiStore.set(queueAtom, (prev) => {
    const remainingThreads = Object.fromEntries(
      Object.entries(prev.activeThreads).filter(
        ([_key, value]) =>
          !(value.threadId === threadId && value.actionType === actionType),
      ),
    );

    return {
      ...prev,
      activeThreads: remainingThreads,
    };
  });
}

export function processQueue({
  threads,
  refetch,
}: {
  threads: Record<string, QueueItem>;
  refetch?: () => void;
}) {
  emailActionQueue.addAll(
    Object.entries(threads).map(
      ([_key, { threadId, actionType, labelId }]) =>
        async () => {
          await pRetry(
            async (attemptCount) => {
              console.log(
                `Queue: ${actionType}. Processing ${threadId}` +
                  (attemptCount > 1 ? ` (attempt ${attemptCount})` : ""),
              );

              const result = await actionMap[actionType](threadId, labelId);

              // when Gmail API returns a rate limit error, throw an error so it can be retried
              if (isActionError(result)) {
                await sleep(exponentialBackoff(attemptCount, 1_000));
                throw new Error(result.error);
              }
              refetch?.();
            },
            { retries: 3 },
          );

          // remove completed thread from activeThreads
          removeThreadFromQueue(threadId, actionType);
        },
    ),
  );
}

export const resetTotalThreads = () => {
  jotaiStore.set(queueAtom, (prev) => ({
    ...prev,
    totalThreads: 0,
  }));
};
