"use client";

import { useCallback, useMemo } from "react";
import { atom, useAtomValue } from "jotai";
import { useAction } from "next-safe-action/hooks";
import { jotaiStore } from "@/store";
import { bulkArchiveAction } from "@/utils/actions/mail-bulk-action";
import { archiveEmails } from "./archive-queue";
import { createSenderQueue } from "./sender-queue";

type QueueStatus = "pending" | "completed";

type QueueItem = {
  status: QueueStatus;
  queued?: boolean;
};

const QUEUED_STATUS_TTL_MS = 30_000;

const queueAtom = atom<Map<string, QueueItem>>(new Map());
const statusAtom = atom((get) => {
  const queue = get(queueAtom);
  return (emailAccountId: string, sender: string) =>
    queue.get(getQueueKey(emailAccountId, sender));
});
const queueCleanupTimers = new Map<string, ReturnType<typeof setTimeout>>();

const { addToQueue: addToArchiveSenderThreadQueue } =
  createSenderQueue(archiveEmails);

export { addToArchiveSenderThreadQueue };

export function useArchiveSenderQueueActions(emailAccountId: string) {
  const { executeAsync, isExecuting } = useAction(
    bulkArchiveAction.bind(null, emailAccountId),
  );

  const queueArchiveSenders = useCallback(
    async ({ senders }: { senders: string[] }) => {
      const uniqueSenders = getUniqueSenders(senders);
      const sendersToQueue = getQueueableSenders({
        emailAccountId,
        senders: uniqueSenders,
        queue: jotaiStore.get(queueAtom),
      });
      if (!sendersToQueue.length) return;

      jotaiStore.set(queueAtom, (prev) => {
        const next = new Map(prev);

        for (const sender of sendersToQueue) {
          const queueKey = getQueueKey(emailAccountId, sender);

          clearQueueCleanupTimer(queueKey);
          next.set(queueKey, { status: "pending" });
        }

        return next;
      });

      let result: Awaited<ReturnType<typeof executeAsync>>;

      try {
        result = await executeAsync({ froms: sendersToQueue });
      } catch (error) {
        clearQueueEntries(emailAccountId, sendersToQueue);
        throw error;
      }

      if (result?.serverError) {
        clearQueueEntries(emailAccountId, sendersToQueue);
        throw new Error(result.serverError);
      }

      jotaiStore.set(queueAtom, (prev) => {
        const next = new Map(prev);
        const queued = result?.data?.mode === "queued";

        for (const sender of sendersToQueue) {
          const queueKey = getQueueKey(emailAccountId, sender);

          next.set(queueKey, { status: "completed", queued });

          if (queued) {
            scheduleQueuedStatusCleanup(queueKey);
          } else {
            clearQueueCleanupTimer(queueKey);
          }
        }

        return next;
      });

      return result?.data;
    },
    [emailAccountId, executeAsync],
  );

  return useMemo(
    () => ({
      queueArchiveSenders,
      isQueueArchiving: isExecuting,
    }),
    [isExecuting, queueArchiveSenders],
  );
}

export function useArchiveSenderStatus(emailAccountId: string, sender: string) {
  const getStatus = useAtomValue(statusAtom);
  return useMemo(
    () => getStatus(emailAccountId, sender),
    [emailAccountId, getStatus, sender],
  );
}

function getUniqueSenders(senders: string[]) {
  const uniqueSenders = new Map<string, string>();

  for (const sender of senders) {
    const normalizedSender = normalizeSender(sender);
    if (!normalizedSender || uniqueSenders.has(normalizedSender)) continue;

    uniqueSenders.set(normalizedSender, sender.trim());
  }

  return Array.from(uniqueSenders.values());
}

function getQueueKey(emailAccountId: string, sender: string) {
  return `${emailAccountId}:${normalizeSender(sender)}`;
}

function getQueueableSenders({
  emailAccountId,
  senders,
  queue,
}: {
  emailAccountId: string;
  senders: string[];
  queue: Map<string, QueueItem>;
}) {
  return senders.filter((sender) => {
    const queueItem = queue.get(getQueueKey(emailAccountId, sender));
    return !isActiveQueueItem(queueItem);
  });
}

function clearQueueCleanupTimer(queueKey: string) {
  const timer = queueCleanupTimers.get(queueKey);
  if (timer) {
    clearTimeout(timer);
    queueCleanupTimers.delete(queueKey);
  }
}

function scheduleQueuedStatusCleanup(queueKey: string) {
  clearQueueCleanupTimer(queueKey);

  queueCleanupTimers.set(
    queueKey,
    setTimeout(() => {
      jotaiStore.set(queueAtom, (prev) => {
        const next = new Map(prev);
        next.delete(queueKey);
        return next;
      });
      queueCleanupTimers.delete(queueKey);
    }, QUEUED_STATUS_TTL_MS),
  );
}

function clearQueueEntries(emailAccountId: string, senders: string[]) {
  jotaiStore.set(queueAtom, (prev) => {
    const next = new Map(prev);

    for (const sender of senders) {
      const queueKey = getQueueKey(emailAccountId, sender);
      clearQueueCleanupTimer(queueKey);
      next.delete(queueKey);
    }

    return next;
  });
}

function normalizeSender(sender: string) {
  return sender.trim().toLowerCase();
}

function isActiveQueueItem(queueItem?: QueueItem) {
  return queueItem?.status === "pending" || queueItem?.queued === true;
}
