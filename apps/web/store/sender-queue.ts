import { useSyncExternalStore } from "react";
import type { ThreadMutationPayload } from "@/utils/mail-engine/mutation-change";
import {
  enqueueThreadMailMutationBatch,
  type ThreadMailMutation,
} from "@/utils/mail-engine/thread-mail-mutations";
import { fetchAllSenderThreads } from "./fetch-sender-threads";
import { removePrefixedStorageKeys } from "./prefixed-storage";

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

type CreatePayload = (params: { labelId?: string }) => ThreadMutationPayload;

export function createSenderQueue(createPayload: CreatePayload) {
  const mutationPayload = createPayload({});
  const storageKey = senderQueueStorageKey(mutationPayload);
  const stored = readStoredQueue(storageKey);
  let durableQueue = new Map(stored?.durable ?? []);
  let progressQueue = new Map(stored?.progress ?? []);
  let transientQueue = new Map(stored?.transient ?? []);
  let stateVersion = 0;
  const stateListeners = new Set<() => void>();
  const inFlightKeys = new Set<string>();
  const accountEpoch = new Map<string, number>();

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
    const startedEpoch = accountEpoch.get(emailAccountId) ?? 0;
    const accountWasCleared = () =>
      (accountEpoch.get(emailAccountId) ?? 0) !== startedEpoch;

    inFlightKeys.add(queueKey);
    setTransientQueueItem(queueKey, {
      status: "pending",
      threadIds: [],
      threadsTotal: 0,
    });

    try {
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
      if (accountWasCleared()) return false;
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
      if (accountWasCleared()) return false;
      upsertDurableItems({
        emailAccountId,
        mutationPayload,
        mutations,
      });
      removeTransientQueueItem(queueKey);
      onSuccess?.(threads.length);
      return true;
    } catch (error) {
      if (accountWasCleared()) return false;
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
    useSyncExternalStore(subscribeToState, getStateVersion, getStateVersion);
    const queueKey = getQueueKey(emailAccountId, sender);
    return transientQueue.get(queueKey) ?? durableQueue.get(queueKey);
  }

  function useQueueProgress(emailAccountId: string) {
    useSyncExternalStore(subscribeToState, getStateVersion, getStateVersion);
    return getQueueProgress(emailAccountId);
  }

  function clearStatuses(emailAccountId: string) {
    accountEpoch.set(
      emailAccountId,
      (accountEpoch.get(emailAccountId) ?? 0) + 1,
    );
    durableQueue = clearAccountItems(durableQueue, emailAccountId);
    progressQueue = clearAccountItems(progressQueue, emailAccountId);
    transientQueue = clearAccountItems(transientQueue, emailAccountId);
    notifyStateListeners();
  }

  function upsertDurableItems({
    emailAccountId,
    mutationPayload,
    mutations,
  }: {
    emailAccountId: string;
    mutationPayload: ThreadMutationPayload;
    mutations: ThreadMailMutation[];
  }) {
    const items = getLatestSenderItems(
      getSenderBatchItems({ emailAccountId, mutationPayload, mutations }),
    );
    durableQueue = new Map(durableQueue);
    progressQueue = new Map(progressQueue);
    for (const [queueKey, latest] of items) {
      durableQueue.set(queueKey, latest.item);
      progressQueue.set(queueKey, latest.item);
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
    persistQueues();
    for (const listener of stateListeners) listener();
  }

  function persistQueues() {
    if (!persistStoredQueues) return;
    const storage = getSessionStorage();
    if (!storage) return;
    try {
      storage.setItem(
        storageKey,
        JSON.stringify({
          durable: [...durableQueue],
          progress: [...progressQueue],
          transient: [...transientQueue].filter(
            ([, item]) => item.status !== "pending",
          ),
        }),
      );
    } catch {
      // Quota or private mode; in-memory progress still works this session.
    }
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
  mutationPayload: ThreadMutationPayload;
  mutations: ThreadMailMutation[];
}) {
  const batches = new Map<string, ThreadMailMutation[]>();
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
  mutations: ThreadMailMutation[],
): QueueItem {
  const activeThreadIds = Array.from(
    new Set(
      mutations
        .filter((mutation) => mutation.status !== "succeeded")
        .map((mutation) => mutation.threadId),
    ),
  );
  const threadIds = Array.from(
    new Set(mutations.map((mutation) => mutation.threadId)),
  );

  return {
    batchId,
    status: activeThreadIds.length ? "processing" : "completed",
    threadIds: activeThreadIds,
    threadsTotal: threadIds.length,
  };
}

function matchesMutationPayload(
  mutation: ThreadMailMutation,
  payload: ThreadMutationPayload,
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

const SENDER_QUEUE_STORAGE_PREFIX = "inbox-zero:sender-queue:";
let persistStoredQueues = true;

function senderQueueStorageKey(payload: ThreadMutationPayload) {
  return `${SENDER_QUEUE_STORAGE_PREFIX}${JSON.stringify(payload)}`;
}

function getSessionStorage() {
  try {
    const storage = globalThis.sessionStorage;
    if (!storage || typeof storage.getItem !== "function") return;
    return storage;
  } catch {
    return;
  }
}

export function clearStoredSenderQueues() {
  persistStoredQueues = false;
  const storage = getSessionStorage();
  if (!storage) return;
  removePrefixedStorageKeys(storage, SENDER_QUEUE_STORAGE_PREFIX);
}

function readStoredQueue(storageKey: string) {
  const storage = getSessionStorage();
  if (!storage) return;
  try {
    const raw = storage.getItem(storageKey);
    if (!raw) return;
    const parsed = JSON.parse(raw) as {
      durable?: unknown;
      progress?: unknown;
      transient?: unknown;
    };
    return {
      durable: parseQueueEntries(parsed.durable),
      progress: parseQueueEntries(parsed.progress),
      transient: parseQueueEntries(parsed.transient),
    };
  } catch {
    return;
  }
}

function parseQueueEntries(value: unknown): Array<[string, QueueItem]> {
  if (!Array.isArray(value)) return [];
  const entries: Array<[string, QueueItem]> = [];
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length !== 2) continue;
    const [queueKey, item] = entry;
    if (typeof queueKey !== "string" || !isQueueItem(item)) continue;
    entries.push([queueKey, item]);
  }
  return entries;
}

function isQueueItem(value: unknown): value is QueueItem {
  if (!value || typeof value !== "object") return false;
  const item = value as QueueItem;
  if (
    item.status !== "processing" &&
    item.status !== "completed" &&
    item.status !== "failed"
  ) {
    return false;
  }
  if (
    !Array.isArray(item.threadIds) ||
    !item.threadIds.every((threadId) => typeof threadId === "string")
  ) {
    return false;
  }
  if (!Number.isFinite(item.threadsTotal) || item.threadsTotal < 0) {
    return false;
  }
  return item.batchId === undefined || typeof item.batchId === "string";
}
