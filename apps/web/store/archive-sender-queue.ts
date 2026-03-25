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
  threadIds: string[];
  threadsTotal: number;
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
    async ({
      senders,
      onSuccess,
      onError,
    }: {
      senders: string[];
      onSuccess?: (sender: string) => void;
      onError?: (sender: string) => void;
    }) => {
      const uniqueSenders = getUniqueSenders(senders);
      if (!uniqueSenders.length) return;

      jotaiStore.set(queueAtom, (prev) => {
        const next = new Map(prev);

        for (const sender of uniqueSenders) {
          const queueKey = getQueueKey(emailAccountId, sender);

          clearQueueCleanupTimer(queueKey);
          next.set(queueKey, {
            status: "pending",
            queued: false,
            threadIds: [],
            threadsTotal: 0,
          });
        }

        return next;
      });

      const result = await executeAsync({ froms: uniqueSenders });

      if (result?.serverError) {
        jotaiStore.set(queueAtom, (prev) => {
          const next = new Map(prev);

          for (const sender of uniqueSenders) {
            const queueKey = getQueueKey(emailAccountId, sender);

            clearQueueCleanupTimer(queueKey);
            next.delete(queueKey);
          }

          return next;
        });

        for (const sender of uniqueSenders) {
          onError?.(sender);
        }

        throw new Error(result.serverError);
      }

      jotaiStore.set(queueAtom, (prev) => {
        const next = new Map(prev);
        const queued = result?.data?.mode === "queued";

        for (const sender of uniqueSenders) {
          const queueKey = getQueueKey(emailAccountId, sender);

          next.set(queueKey, {
            status: "completed",
            queued,
            threadIds: [],
            threadsTotal: 0,
          });

          if (queued) {
            scheduleQueuedStatusCleanup(queueKey);
          } else {
            clearQueueCleanupTimer(queueKey);
          }
        }

        return next;
      });

      for (const sender of uniqueSenders) {
        onSuccess?.(sender);
      }

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
  return Array.from(
    new Set(senders.map((sender) => sender.trim()).filter(Boolean)),
  );
}

function getQueueKey(emailAccountId: string, sender: string) {
  return `${emailAccountId}:${sender.trim().toLowerCase()}`;
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
