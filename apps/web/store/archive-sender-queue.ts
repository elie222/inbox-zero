"use client";

import { useCallback, useMemo } from "react";
import { atom, useAtomValue } from "jotai";
import useSWR from "swr";
import { useAction } from "next-safe-action/hooks";
import { jotaiStore } from "@/store";
import { bulkArchiveAction } from "@/utils/actions/mail-bulk-action";
import { archiveEmails } from "./archive-queue";
import { createSenderQueue } from "./sender-queue";
import type { BulkArchiveSenderStatuses } from "@/app/api/user/bulk-archive/sender-status/route";

type QueueStatus = "pending" | "completed";
type SenderQueueStatus = QueueStatus | "queued" | "processing" | "failed";

type QueueItem = {
  status: SenderQueueStatus;
  archivedCount?: number;
};

const queueAtom = atom<Map<string, QueueItem>>(new Map());
const statusAtom = atom((get) => {
  const queue = get(queueAtom);
  return (emailAccountId: string, sender: string) =>
    queue.get(getQueueKey(emailAccountId, sender));
});

const { addToQueue: addToArchiveSenderThreadQueue } =
  createSenderQueue(archiveEmails);

export { addToArchiveSenderThreadQueue };

export function useArchiveSenderQueueActions(emailAccountId: string) {
  const { data: senderStatuses } = useSWR<BulkArchiveSenderStatuses>(
    "/api/user/bulk-archive/sender-status",
    {
      refreshInterval: 1000,
    },
  );
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
        senderStatuses,
      });
      if (!sendersToQueue.length) return;

      jotaiStore.set(queueAtom, (prev) => {
        const next = new Map(prev);

        for (const sender of sendersToQueue) {
          const queueKey = getQueueKey(emailAccountId, sender);
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

          next.set(queueKey, { status: queued ? "queued" : "completed" });
        }

        return next;
      });

      return result?.data;
    },
    [emailAccountId, executeAsync, senderStatuses],
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
  const { data } = useSWR<BulkArchiveSenderStatuses>(
    "/api/user/bulk-archive/sender-status",
    {
      refreshInterval: 1000,
    },
  );
  return useMemo(
    () => data?.[normalizeSender(sender)] || getStatus(emailAccountId, sender),
    [data, emailAccountId, getStatus, sender],
  );
}

export function clearArchiveSenderStatuses(emailAccountId: string) {
  jotaiStore.set(queueAtom, (prev) => {
    const next = new Map(prev);

    for (const queueKey of next.keys()) {
      if (!queueKey.startsWith(`${emailAccountId}:`)) continue;
      next.delete(queueKey);
    }

    return next;
  });
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
  senderStatuses,
}: {
  emailAccountId: string;
  senders: string[];
  queue: Map<string, QueueItem>;
  senderStatuses?: BulkArchiveSenderStatuses;
}) {
  return senders.filter((sender) => {
    const queueItem = queue.get(getQueueKey(emailAccountId, sender));
    const backendStatus = senderStatuses?.[normalizeSender(sender)];
    return (
      !isActiveQueueItem(queueItem) && !isActiveSenderStatus(backendStatus)
    );
  });
}

function clearQueueEntries(emailAccountId: string, senders: string[]) {
  jotaiStore.set(queueAtom, (prev) => {
    const next = new Map(prev);

    for (const sender of senders) {
      const queueKey = getQueueKey(emailAccountId, sender);
      next.delete(queueKey);
    }

    return next;
  });
}

function normalizeSender(sender: string) {
  return sender.trim().toLowerCase();
}

function isActiveQueueItem(queueItem?: QueueItem) {
  return (
    queueItem?.status === "pending" ||
    queueItem?.status === "queued" ||
    queueItem?.status === "processing"
  );
}

function isActiveSenderStatus(
  senderStatus?: BulkArchiveSenderStatuses[string],
) {
  return (
    senderStatus?.status === "queued" || senderStatus?.status === "processing"
  );
}
