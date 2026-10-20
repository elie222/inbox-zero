"use client";

import { useCallback, useMemo } from "react";
import { createSenderQueue } from "./sender-queue";

const { addToQueue, clearStatuses, useQueueProgress, useSenderStatus } =
  createSenderQueue(({ labelId }) => ({ kind: "archive", labelId }));

export const addToArchiveSenderThreadQueue = addToQueue;
export const useArchiveSenderStatus = useSenderStatus;
export const useArchiveQueueProgress = useQueueProgress;
export const clearArchiveSenderStatuses = clearStatuses;

export function useArchiveSenderQueueActions(emailAccountId: string) {
  const progress = useArchiveQueueProgress(emailAccountId);

  const queueArchiveSenders = useCallback(
    async ({
      senders,
      onThreadsQueued,
    }: {
      senders: string[];
      onThreadsQueued?: Parameters<
        typeof addToArchiveSenderThreadQueue
      >[0]["onThreadsQueued"];
    }) => {
      let queuedSenders = 0;

      for (const sender of getUniqueSenders(senders)) {
        try {
          const queued = await addToArchiveSenderThreadQueue({
            sender,
            emailAccountId,
            onThreadsQueued,
          });
          if (queued) queuedSenders += 1;
        } catch {}
      }

      return queuedSenders;
    },
    [emailAccountId],
  );

  return useMemo(
    () => ({
      queueArchiveSenders,
      isQueueArchiving: Boolean(progress?.activeItems),
    }),
    [progress, queueArchiveSenders],
  );
}

function getUniqueSenders(senders: string[]) {
  const uniqueSenders = new Map<string, string>();

  for (const sender of senders) {
    const normalizedSender = sender.trim().toLowerCase();
    if (!normalizedSender || uniqueSenders.has(normalizedSender)) continue;
    uniqueSenders.set(normalizedSender, sender.trim());
  }

  return Array.from(uniqueSenders.values());
}
