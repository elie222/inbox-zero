import { atomWithStorage, createJSONStorage } from "jotai/utils";
import pRetry from "p-retry";
import { jotaiStore } from "@/store";
import { emailActionQueue } from "@/utils/queue/email-action-queue";
import {
  archiveThreadAction,
  trashThreadAction,
  markReadThreadAction,
} from "@/utils/actions/mail";
import { exponentialBackoff, sleep } from "@/utils/sleep";
import { useAtomValue } from "jotai";

export type QueueActionType = "archive" | "delete" | "markRead";

type QueueKey = `${QueueActionType}-${string}`;

type QueueItem = {
  threadId: string;
  actionType: QueueActionType;
  labelId?: string;
};

type QueueState = {
  activeThreads: Record<QueueKey, QueueItem>;
  totalThreads: number;
};

type QueuedJobStatus = "pending" | "running" | "cancelled";

type QueuedJob = {
  threadId: string;
  actionType: QueueActionType;
  status: QueuedJobStatus;
};

// p-queue can't remove a task once it's been added, so cancellation is tracked
// here instead: a cancelled job returns immediately when its turn comes up.
// Only holds jobs that haven't finished yet.
const queuedJobs = new Map<QueueKey, QueuedJob>();

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
const queueAtom = atomWithStorage(
  "gmailActionQueue",
  { activeThreads: {}, totalThreads: 0 },
  createStorage(),
  { getOnInit: true },
);

export function useQueueState() {
  return useAtomValue(queueAtom);
}

type ActionFunction = ({
  threadId,
  labelId,
}: {
  threadId: string;
  labelId?: string;
  // biome-ignore lint/suspicious/noExplicitAny: existing loose external shape
}) => Promise<any>;

const addThreadsToQueue = ({
  actionType,
  threadIds,
  labelId,
  onSuccess,
  onError,
  emailAccountId,
}: {
  actionType: QueueActionType;
  threadIds: string[];
  labelId?: string;
  onSuccess?: (threadId: string) => void;
  onError?: (threadId: string) => void;
  emailAccountId: string;
}) => {
  const threads = Object.fromEntries(
    threadIds
      // Re-enqueuing a thread that is already queued would orphan the first
      // job: cancellation only reaches the newest one, so the orphan would
      // still reach the provider while undo believed it had been cancelled.
      // Filtered here rather than at job creation so the progress totals below
      // count only the work actually enqueued.
      .filter((threadId) => {
        const existing = queuedJobs.get(getQueueKey(actionType, threadId));
        return !existing || existing.status === "cancelled";
      })
      .map((threadId) => [
        getQueueKey(actionType, threadId),
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

  processQueue({ threads, onSuccess, onError, emailAccountId });
};

export const archiveEmails = async ({
  threadIds,
  labelId,
  onSuccess,
  onError,
  emailAccountId,
}: {
  threadIds: string[];
  labelId?: string;
  onSuccess?: (threadId: string) => void;
  onError?: (threadId: string) => void;
  emailAccountId: string;
}) => {
  addThreadsToQueue({
    actionType: "archive",
    threadIds,
    labelId,
    onSuccess,
    onError,
    emailAccountId,
  });
};

export const markReadThreads = async ({
  threadIds,
  onSuccess,
  onError,
  emailAccountId,
}: {
  threadIds: string[];
  onSuccess: (threadId: string) => void;
  onError?: (threadId: string) => void;
  emailAccountId: string;
}) => {
  addThreadsToQueue({
    actionType: "markRead",
    threadIds,
    onSuccess,
    onError,
    emailAccountId,
  });
};

export const deleteEmails = async ({
  threadIds,
  onSuccess,
  onError,
  emailAccountId,
}: {
  threadIds: string[];
  onSuccess: (threadId: string) => void;
  onError?: (threadId: string) => void;
  emailAccountId: string;
}) => {
  addThreadsToQueue({
    actionType: "delete",
    threadIds,
    onSuccess,
    onError,
    emailAccountId,
  });
};

function removeThreadFromQueue(threadId: string, actionType: QueueActionType) {
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
  onSuccess,
  onError,
  emailAccountId,
}: {
  threads: Record<string, QueueItem>;
  onSuccess?: (threadId: string) => void;
  onError?: (threadId: string) => void;
  emailAccountId: string;
}) {
  const actionMap: Record<QueueActionType, ActionFunction> = {
    archive: ({ threadId, labelId }) =>
      archiveThreadAction(emailAccountId, { threadId, labelId }),
    delete: ({ threadId }) => trashThreadAction(emailAccountId, { threadId }),
    markRead: ({ threadId }) =>
      markReadThreadAction(emailAccountId, { threadId, read: true }),
  };

  emailActionQueue.addAll(
    Object.values(threads).map(({ threadId, actionType, labelId }) => {
      const key = getQueueKey(actionType, threadId);
      const job: QueuedJob = { threadId, actionType, status: "pending" };
      queuedJobs.set(key, job);

      return async () => {
        // cancelled while it was still waiting its turn, so nothing was sent
        if (job.status === "cancelled") return;
        job.status = "running";

        try {
          await pRetry(
            async (attemptCount) => {
              // biome-ignore lint/suspicious/noConsole: frontend
              console.log(
                `Queue: ${actionType}. Processing ${threadId}${attemptCount > 1 ? ` (attempt ${attemptCount})` : ""}`,
              );

              const result = await actionMap[actionType]({
                threadId,
                labelId,
              });

              // when Gmail API returns a rate limit error, throw an error so it can be retried
              if (result?.serverError) {
                await sleep(exponentialBackoff(attemptCount, 1000));
                throw new Error(result.serverError);
              }
              onSuccess?.(threadId);
            },
            { retries: 3 },
          );
        } catch {
          // all retries failed
          onError?.(threadId);
        }

        if (queuedJobs.get(key) === job) queuedJobs.delete(key);

        // remove completed thread from activeThreads
        removeThreadFromQueue(threadId, actionType);
      };
    }),
  );
}

/**
 * Undo support: drops threads that are still waiting in the queue so the action
 * never reaches the provider. Threads already sent can't be pulled back — the
 * caller must reverse those itself (e.g. unarchive/untrash).
 */
export function cancelQueuedThreads({
  threadIds,
  actionType,
}: {
  threadIds: string[];
  actionType: QueueActionType;
}): { cancelled: string[]; notCancelled: string[] } {
  const cancelled: string[] = [];
  const notCancelled: string[] = [];

  for (const threadId of new Set(threadIds)) {
    const key = getQueueKey(actionType, threadId);
    const job = queuedJobs.get(key);

    if (job?.status === "pending") {
      job.status = "cancelled";
      queuedJobs.delete(key);
      cancelled.push(threadId);
    } else {
      notCancelled.push(threadId);
    }
  }

  if (cancelled.length) {
    jotaiStore.set(queueAtom, (prev) => {
      const activeThreads: QueueState["activeThreads"] = {
        ...prev.activeThreads,
      };
      for (const threadId of cancelled) {
        delete activeThreads[getQueueKey(actionType, threadId)];
      }

      return {
        activeThreads,
        totalThreads: Math.max(0, prev.totalThreads - cancelled.length),
      };
    });
  }

  return { cancelled, notCancelled };
}

export const resetTotalThreads = () => {
  jotaiStore.set(queueAtom, (prev) => ({
    ...prev,
    totalThreads: 0,
  }));
};

function getQueueKey(actionType: QueueActionType, threadId: string): QueueKey {
  return `${actionType}-${threadId}`;
}
