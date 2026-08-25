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
    async ({ senders }: { senders: string[] }) => {
      let queuedSenders = 0;

      for (const sender of getUniqueSenders(senders)) {
        const queued = await addToArchiveSenderThreadQueue({
          sender,
          emailAccountId,
        });
        if (queued) queuedSenders += 1;
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
