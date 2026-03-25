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

const queueAtom = atom<Map<string, QueueItem>>(new Map());
const statusAtom = atom((get) => {
  const queue = get(queueAtom);
  return (sender: string) => queue.get(sender);
});

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
          next.set(sender, {
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
            next.delete(sender);
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
          next.set(sender, {
            status: "completed",
            queued,
            threadIds: [],
            threadsTotal: 0,
          });
        }

        return next;
      });

      for (const sender of uniqueSenders) {
        onSuccess?.(sender);
      }

      return result?.data;
    },
    [executeAsync],
  );

  return useMemo(
    () => ({
      queueArchiveSenders,
      isQueueArchiving: isExecuting,
    }),
    [isExecuting, queueArchiveSenders],
  );
}

export function useArchiveSenderStatus(sender: string) {
  const getStatus = useAtomValue(statusAtom);
  return useMemo(() => getStatus(sender), [getStatus, sender]);
}

function getUniqueSenders(senders: string[]) {
  return Array.from(
    new Set(senders.map((sender) => sender.trim()).filter(Boolean)),
  );
}
