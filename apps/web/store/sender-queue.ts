import { useEffect, useSyncExternalStore } from "react";
import {
  getMailMutationsForAccount,
  isActiveMailMutationStatus,
  type MailMutation,
  type MailMutationPayload,
  subscribeToMailMutations,
} from "@/utils/email-cache/mail-mutations";
import { enqueueThreadMailMutationBatch } from "@/utils/email-cache/thread-mail-mutations";
import { fetchAllSenderThreads } from "./fetch-sender-threads";

type QueueStatus = "pending" | "processing" | "completed" | "failed";

type QueueItem = {
  batchId?: string;
  status: QueueStatus;
  threadIds: string[];
  threadsTotal: number;
};

type QueueProgress = {
  activeItems: number;
  completedItems: number;
  failedItems: number;
  settledItems: number;
  totalItems: number;
};

type CreatePayload = (params: { labelId?: string }) => MailMutationPayload;

export function createSenderQueue(createPayload: CreatePayload) {
  let durableQueue = new Map<string, QueueItem>();
  let progressQueue = new Map<string, QueueItem>();
  let transientQueue = new Map<string, QueueItem>();
  let stateVersion = 0;
  const stateListeners = new Set<() => void>();
  const mutationPayload = createPayload({});
  const inFlightKeys = new Set<string>();
  const observedAccounts = new Map<string, number>();
  const refreshes = new Map<string, Promise<void>>();
  const trackedBatchByQueueKey = new Map<string, string>();
  let unsubscribeFromMutations: (() => void) | undefined;

  async function addToQueue({
    sender,
    labelId,
    onSuccess,
    onError,
    emailAccountId,
  }: {
    sender: string;
    labelId?: string;
    onSuccess?: (totalThreads: number) => void;
    onError?: (sender: string) => void;
    emailAccountId: string;
  }) {
    const normalizedSender = normalizeSender(sender);
    if (!normalizedSender) return false;
    const queueKey = getQueueKey(emailAccountId, normalizedSender);
    if (inFlightKeys.has(queueKey)) return false;

    inFlightKeys.add(queueKey);
    setTransientQueueItem(queueKey, {
      status: "pending",
      threadIds: [],
      threadsTotal: 0,
    });

    try {
      const accountMutations = await getMailMutationsForAccount(emailAccountId);
      replaceDurableAccountItems({
        emailAccountId,
        mutationPayload,
        mutations: accountMutations,
        trackedBatchByQueueKey,
      });
      const existingItem = durableQueue.get(queueKey);
      if (existingItem?.status === "processing") {
        removeTransientQueueItem(queueKey);
        return false;
      }

      const { threads } = await fetchAllSenderThreads({
        sender,
        labelId: "INBOX",
        emailAccountId,
      });
      const threadIds = threads.map((thread) => thread.id);

      if (!threads.length) {
        setTransientQueueItem(queueKey, {
          status: "completed",
          threadIds: [],
          threadsTotal: 0,
        });
        onSuccess?.(0);
        return true;
      }

      setTransientQueueItem(queueKey, {
        status: "pending",
        threadIds,
        threadsTotal: threads.length,
      });

      const { mutations } = await enqueueThreadMailMutationBatch({
        clientSource: { kind: "sender", sender: normalizedSender },
        emailAccountId,
        threads,
        payload: createPayload({ labelId }),
      });
      upsertDurableItems({
        emailAccountId,
        mutationPayload,
        mutations,
        trackedBatchByQueueKey,
      });
      removeTransientQueueItem(queueKey);
      onSuccess?.(threads.length);
      return true;
    } catch (error) {
      const existingItem = transientQueue.get(queueKey);
      setTransientQueueItem(queueKey, {
        status: "failed",
        threadIds: existingItem?.threadIds ?? [],
        threadsTotal: existingItem?.threadsTotal ?? 0,
      });
      onError?.(sender);
      throw error;
    } finally {
      inFlightKeys.delete(queueKey);
    }
  }

  function useSenderStatus(emailAccountId: string, sender: string) {
    useEffect(() => observeAccount(emailAccountId), [emailAccountId]);
    useSyncExternalStore(subscribeToState, getStateVersion, getStateVersion);
    const queueKey = getQueueKey(emailAccountId, sender);
    return transientQueue.get(queueKey) ?? durableQueue.get(queueKey);
  }

  function useQueueProgress(emailAccountId: string) {
    useEffect(() => observeAccount(emailAccountId), [emailAccountId]);
    useSyncExternalStore(subscribeToState, getStateVersion, getStateVersion);
    return getQueueProgress(emailAccountId);
  }

  function clearStatuses(emailAccountId: string) {
    durableQueue = clearAccountItems(durableQueue, emailAccountId);
    progressQueue = clearAccountItems(progressQueue, emailAccountId);
    transientQueue = clearAccountItems(transientQueue, emailAccountId);
    for (const queueKey of trackedBatchByQueueKey.keys()) {
      if (isAccountQueueKey(queueKey, emailAccountId)) {
        trackedBatchByQueueKey.delete(queueKey);
      }
    }
    notifyStateListeners();
  }

  function observeAccount(emailAccountId: string) {
    observedAccounts.set(
      emailAccountId,
      (observedAccounts.get(emailAccountId) ?? 0) + 1,
    );
    refreshAccount(emailAccountId).catch(() => {});

    unsubscribeFromMutations ??= subscribeToMailMutations(() => {
      for (const observedAccountId of observedAccounts.keys()) {
        refreshAccount(observedAccountId).catch(() => {});
      }
    });

    return () => {
      const observerCount = (observedAccounts.get(emailAccountId) ?? 1) - 1;
      if (observerCount > 0) {
        observedAccounts.set(emailAccountId, observerCount);
      } else {
        observedAccounts.delete(emailAccountId);
      }

      if (!observedAccounts.size) {
        unsubscribeFromMutations?.();
        unsubscribeFromMutations = undefined;
      }
    };
  }

  function refreshAccount(emailAccountId: string) {
    const previousRefresh = refreshes.get(emailAccountId) ?? Promise.resolve();
    const refresh = previousRefresh
      .catch(() => {})
      .then(async () => {
        const mutations = await getMailMutationsForAccount(emailAccountId);
        replaceDurableAccountItems({
          emailAccountId,
          mutationPayload,
          mutations,
          trackedBatchByQueueKey,
        });
      });
    refreshes.set(emailAccountId, refresh);
    const removeCompletedRefresh = () => {
      if (refreshes.get(emailAccountId) === refresh) {
        refreshes.delete(emailAccountId);
      }
    };
    refresh.then(removeCompletedRefresh, removeCompletedRefresh);
    return refresh;
  }

  function replaceDurableAccountItems({
    emailAccountId,
    mutationPayload,
    mutations,
    trackedBatchByQueueKey,
  }: {
    emailAccountId: string;
    mutationPayload: MailMutationPayload;
    mutations: MailMutation[];
    trackedBatchByQueueKey: Map<string, string>;
  }) {
    const batchItems = getSenderBatchItems({
      emailAccountId,
      mutationPayload,
      mutations,
    });
    const accountItems = getLatestSenderItems(batchItems);
    for (const [queueKey, latest] of accountItems) {
      if (latest.item.status === "processing" && latest.item.batchId) {
        trackedBatchByQueueKey.set(queueKey, latest.item.batchId);
      }
    }
    durableQueue = clearAccountItems(durableQueue, emailAccountId);
    for (const [queueKey, latest] of accountItems) {
      if (
        latest.item.status !== "completed" ||
        trackedBatchByQueueKey.get(queueKey) === latest.item.batchId
      ) {
        durableQueue.set(queueKey, latest.item);
      }
    }
    progressQueue = clearAccountItems(progressQueue, emailAccountId);
    for (const [queueKey, batchId] of trackedBatchByQueueKey) {
      if (!isAccountQueueKey(queueKey, emailAccountId)) continue;
      const item = batchItems.get(batchId)?.item;
      if (item) progressQueue.set(queueKey, item);
    }
    notifyStateListeners();
  }

  function upsertDurableItems({
    emailAccountId,
    mutationPayload,
    mutations,
    trackedBatchByQueueKey,
  }: {
    emailAccountId: string;
    mutationPayload: MailMutationPayload;
    mutations: MailMutation[];
    trackedBatchByQueueKey: Map<string, string>;
  }) {
    const items = getLatestSenderItems(
      getSenderBatchItems({ emailAccountId, mutationPayload, mutations }),
    );
    durableQueue = new Map(durableQueue);
    progressQueue = new Map(progressQueue);
    for (const [queueKey, latest] of items) {
      durableQueue.set(queueKey, latest.item);
      progressQueue.set(queueKey, latest.item);
      if (latest.item.batchId) {
        trackedBatchByQueueKey.set(queueKey, latest.item.batchId);
      }
    }
    notifyStateListeners();
  }

  function setTransientQueueItem(queueKey: string, item: QueueItem) {
    transientQueue = new Map(transientQueue);
    transientQueue.set(queueKey, item);
    notifyStateListeners();
  }

  function removeTransientQueueItem(queueKey: string) {
    transientQueue = new Map(transientQueue);
    transientQueue.delete(queueKey);
    notifyStateListeners();
  }

  function getQueueProgress(emailAccountId: string): QueueProgress | undefined {
    const queue = new Map(progressQueue);
    for (const [queueKey, item] of transientQueue) queue.set(queueKey, item);
    let activeItems = 0;
    let completedItems = 0;
    let failedItems = 0;

    for (const [queueKey, item] of queue) {
      if (!isAccountQueueKey(queueKey, emailAccountId)) continue;
      if (item.status === "completed") completedItems += 1;
      else if (item.status === "failed") failedItems += 1;
      else activeItems += 1;
    }

    const totalItems = activeItems + completedItems + failedItems;
    if (!totalItems) return;
    return {
      activeItems,
      completedItems,
      failedItems,
      settledItems: completedItems + failedItems,
      totalItems,
    };
  }

  function subscribeToState(listener: () => void) {
    stateListeners.add(listener);
    return () => stateListeners.delete(listener);
  }

  function getStateVersion() {
    return stateVersion;
  }

  function notifyStateListeners() {
    stateVersion += 1;
    for (const listener of stateListeners) listener();
  }

  return {
    addToQueue,
    clearStatuses,
    useQueueProgress,
    useSenderStatus,
  };
}

function getSenderBatchItems({
  emailAccountId,
  mutationPayload,
  mutations,
}: {
  emailAccountId: string;
  mutationPayload: MailMutationPayload;
  mutations: MailMutation[];
}) {
  const batches = new Map<string, MailMutation[]>();
  for (const mutation of mutations) {
    if (
      mutation.emailAccountId !== emailAccountId ||
      mutation.clientSource?.kind !== "sender" ||
      !matchesMutationPayload(mutation, mutationPayload)
    ) {
      continue;
    }
    const batch = batches.get(mutation.batchId) ?? [];
    batch.push(mutation);
    batches.set(mutation.batchId, batch);
  }

  const batchItems = new Map<
    string,
    { item: QueueItem; queueKey: string; queuedAt: number; updatedAt: number }
  >();
  for (const [batchId, batch] of batches) {
    const sender = batch[0]?.clientSource?.sender;
    if (!sender) continue;
    const queueKey = getQueueKey(emailAccountId, sender);
    const queuedAt = Math.max(...batch.map((mutation) => mutation.createdAt));
    const updatedAt = Math.max(...batch.map((mutation) => mutation.updatedAt));
    batchItems.set(batchId, {
      item: getBatchQueueItem(batchId, batch),
      queueKey,
      queuedAt,
      updatedAt,
    });
  }
  return batchItems;
}

function getLatestSenderItems(
  batchItems: Map<
    string,
    { item: QueueItem; queueKey: string; queuedAt: number; updatedAt: number }
  >,
) {
  const latestItems = new Map<
    string,
    { item: QueueItem; queuedAt: number; updatedAt: number }
  >();
  for (const batch of batchItems.values()) {
    const existing = latestItems.get(batch.queueKey);
    if (
      existing &&
      (existing.queuedAt > batch.queuedAt ||
        (existing.queuedAt === batch.queuedAt &&
          existing.updatedAt > batch.updatedAt))
    ) {
      continue;
    }
    latestItems.set(batch.queueKey, batch);
  }
  return latestItems;
}

function getBatchQueueItem(
  batchId: string,
  mutations: MailMutation[],
): QueueItem {
  const activeThreadIds = Array.from(
    new Set(
      mutations
        .filter((mutation) => isActiveMailMutationStatus(mutation.status))
        .map((mutation) => mutation.threadId),
    ),
  );
  const threadIds = Array.from(
    new Set(mutations.map((mutation) => mutation.threadId)),
  );

  let status: QueueStatus = "completed";
  if (activeThreadIds.length) status = "processing";
  else if (
    mutations.some(
      (mutation) =>
        mutation.status === "failed" || mutation.status === "uncertain",
    )
  ) {
    status = "failed";
  }

  return {
    batchId,
    status,
    threadIds: activeThreadIds,
    threadsTotal: threadIds.length,
  };
}

function matchesMutationPayload(
  mutation: MailMutation,
  payload: MailMutationPayload,
) {
  if (mutation.kind !== payload.kind) return false;
  if (mutation.kind === "set_read_state" && payload.kind === "set_read_state") {
    return mutation.read === payload.read;
  }
  return true;
}

function clearAccountItems(
  queue: Map<string, QueueItem>,
  emailAccountId: string,
) {
  const nextQueue = new Map(queue);
  for (const queueKey of nextQueue.keys()) {
    if (isAccountQueueKey(queueKey, emailAccountId)) nextQueue.delete(queueKey);
  }
  return nextQueue;
}

function isAccountQueueKey(queueKey: string, emailAccountId: string) {
  return queueKey.startsWith(`${emailAccountId}:`);
}

function getQueueKey(emailAccountId: string, sender: string) {
  return `${emailAccountId}:${normalizeSender(sender)}`;
}

function normalizeSender(sender: string) {
  return sender.trim().toLowerCase();
}
