import type { SendEmailBody } from "@/utils/types/mail";
import {
  getEmailCacheDatabase,
  type MailMutationClientSource,
  type StoredMailMutation,
} from "./database";
import { randomUuid } from "@/utils/uuid";

export type MailMutationPayload =
  | { kind: "archive"; labelId?: string }
  | { kind: "unarchive" }
  | { kind: "trash" }
  | { kind: "untrash" }
  | { kind: "set_read_state"; read: boolean }
  | { kind: "snooze"; scheduledFor: string }
  | { kind: "cancel_snooze"; snoozeMutationId: string }
  | { kind: "reply"; email: SendEmailBody };

export type MailMutation = Omit<StoredMailMutation, "kind" | "payload"> &
  MailMutationPayload;

export type EnqueueMailMutationInput = MailMutationPayload & {
  id?: string;
  batchId?: string;
  clientSource?: MailMutationClientSource;
  emailAccountId: string;
  threadId: string;
  messageIds: string[];
};

export type MailMutationSyncGroup = {
  batchId: string;
  emailAccountId: string;
  mutations: MailMutation[];
};

const PROVIDER_ACTIVE_STATUS_VALUES = [
  "pending",
  "processing",
  "retry_wait",
  "blocked_auth",
] as const satisfies StoredMailMutation["status"][];
const ACTIVE_STATUS_VALUES = [
  ...PROVIDER_ACTIVE_STATUS_VALUES,
  "awaiting_sync",
  "reconciling",
] as const satisfies StoredMailMutation["status"][];
const ACTIVE_STATUSES = new Set<StoredMailMutation["status"]>(
  ACTIVE_STATUS_VALUES,
);
const PROVIDER_ACTIVE_STATUSES = new Set<StoredMailMutation["status"]>(
  PROVIDER_ACTIVE_STATUS_VALUES,
);

const listeners = new Set<(mutations?: MailMutation[]) => void>();
const channel =
  typeof window === "undefined" || typeof BroadcastChannel === "undefined"
    ? null
    : new BroadcastChannel("inbox-zero-mail-mutations");

channel?.addEventListener("message", (event: MessageEvent<unknown>) => {
  const mutationIds = getMutationChangeIds(event.data);
  if (!mutationIds?.length) {
    notifyListeners();
    return;
  }
  getMailMutations(mutationIds)
    .then((mutations) => notifyListeners(mutations))
    .catch(() => notifyListeners());
});

export function isActiveMailMutationStatus(
  status: StoredMailMutation["status"],
) {
  return ACTIVE_STATUSES.has(status);
}

export async function enqueueMailMutation(
  input: EnqueueMailMutationInput,
  now = Date.now(),
): Promise<MailMutation> {
  const [mutation] = await enqueueMailMutationBatch([input], now);
  if (!mutation) throw new Error("Mail mutation was not queued");
  return mutation;
}

export async function enqueueMailMutationBatch(
  inputs: EnqueueMailMutationInput[],
  now = Date.now(),
): Promise<MailMutation[]> {
  if (!inputs.length) return [];
  const suppliedBatchIds = new Set(
    inputs.flatMap((input) => (input.batchId ? [input.batchId] : [])),
  );
  if (suppliedBatchIds.size > 1) {
    throw new Error("Mail mutation batches must use one batch ID");
  }
  const batchId = suppliedBatchIds.values().next().value ?? randomUuid();
  const preparedInputs = inputs.map((input) => ({
    ...input,
    batchId,
    id: input.id ?? randomUuid(),
  }));
  const database = await getEmailCacheDatabase();
  if (!database) throw new Error("Offline mail storage is unavailable");

  const transaction = database.transaction("mailMutations", "readwrite");
  const store = transaction.objectStore("mailMutations");
  const storedMutations: StoredMailMutation[] = [];
  try {
    for (const input of preparedInputs) {
      storedMutations.push(await enqueueInStore(store, input, now));
    }
    await transaction.done;
  } catch (error) {
    try {
      transaction.abort();
    } catch {}
    await transaction.done.catch(() => {});
    throw error;
  }
  const mutations = storedMutations.map(toMailMutation);
  notifyMailMutationChange(mutations);
  return mutations;
}

export async function getActiveMailMutations(
  emailAccountId?: string,
): Promise<MailMutation[]> {
  const database = await getEmailCacheDatabase();
  if (!database) return [];
  const records = emailAccountId
    ? await database.getAllFromIndex(
        "mailMutations",
        "byAccount",
        emailAccountId,
      )
    : await database.getAll("mailMutations");
  return records
    .filter((mutation) => isActiveMailMutationStatus(mutation.status))
    .sort(compareMutations)
    .map(toMailMutation);
}

export async function getMailMutation(
  id: string,
): Promise<MailMutation | undefined> {
  const database = await getEmailCacheDatabase();
  const stored = await database?.get("mailMutations", id);
  return stored ? toMailMutation(stored) : undefined;
}

export async function getMailMutations(ids: string[]): Promise<MailMutation[]> {
  if (!ids.length) return [];
  const database = await getEmailCacheDatabase();
  if (!database) return [];
  const transaction = database.transaction("mailMutations", "readonly");
  const store = transaction.objectStore("mailMutations");
  const stored = await Promise.all(ids.map((id) => store.get(id)));
  await transaction.done;
  return stored.flatMap((mutation) =>
    mutation ? [toMailMutation(mutation)] : [],
  );
}

export async function getMailMutationsForAccount(
  emailAccountId: string,
): Promise<MailMutation[]> {
  const database = await getEmailCacheDatabase();
  if (!database) return [];
  const records = await database.getAllFromIndex(
    "mailMutations",
    "byAccount",
    emailAccountId,
  );
  return records.sort(compareMutations).map(toMailMutation);
}

export async function getNextMailMutationWakeAt(): Promise<number | undefined> {
  const database = await getEmailCacheDatabase();
  if (!database) return;
  const transaction = database.transaction("mailMutations", "readonly");
  const mutations = (
    await readActiveStoredMutations(
      transaction.objectStore("mailMutations").index("byNextAttempt"),
    )
  ).sort(compareMutations);
  await transaction.done;
  const seenThreads = new Set<string>();
  const wakeTimes: number[] = [];
  for (const mutation of mutations) {
    if (!isActiveMailMutationStatus(mutation.status)) continue;
    const threadKey = `${mutation.emailAccountId}\u0000${mutation.threadId}`;
    if (seenThreads.has(threadKey)) continue;
    seenThreads.add(threadKey);
    if (mutation.status === "pending" || mutation.status === "retry_wait") {
      wakeTimes.push(mutation.nextAttemptAt);
    }
    if (mutation.status === "processing" && mutation.leaseExpiresAt) {
      wakeTimes.push(mutation.leaseExpiresAt);
    }
  }
  for (const group of createStoredSyncGroups(mutations)) {
    if (
      group.mutations.some((mutation) =>
        isProviderActiveMailMutationStatus(mutation.status),
      )
    ) {
      continue;
    }
    const syncWakeTimes = group.mutations.flatMap((mutation) => {
      if (mutation.status === "awaiting_sync") return [mutation.nextAttemptAt];
      if (mutation.status === "reconciling" && mutation.leaseExpiresAt) {
        return [mutation.leaseExpiresAt];
      }
      return [];
    });
    if (syncWakeTimes.length) wakeTimes.push(Math.max(...syncWakeTimes));
  }
  return wakeTimes.length ? Math.min(...wakeTimes) : undefined;
}

export async function claimNextMailMutation({
  leaseMs,
  now = Date.now(),
  ownerId,
}: {
  leaseMs: number;
  now?: number;
  ownerId: string;
}): Promise<MailMutation | undefined> {
  const database = await getEmailCacheDatabase();
  if (!database) return;
  const transaction = database.transaction("mailMutations", "readwrite");
  const store = transaction.objectStore("mailMutations");
  const mutations = (
    await readActiveStoredMutations(store.index("byNextAttempt"))
  ).sort(compareMutations);
  const blockedThreads = new Set<string>();
  let claimed: StoredMailMutation | undefined;
  let changed = false;

  for (const mutation of mutations) {
    if (!isActiveMailMutationStatus(mutation.status)) continue;
    const threadKey = `${mutation.emailAccountId}\u0000${mutation.threadId}`;
    if (blockedThreads.has(threadKey)) continue;

    if (
      mutation.status === "processing" &&
      (mutation.leaseExpiresAt ?? Number.POSITIVE_INFINITY) > now
    ) {
      blockedThreads.add(threadKey);
      continue;
    }

    if (isSyncMailMutationStatus(mutation.status)) {
      blockedThreads.add(threadKey);
      continue;
    }

    if (mutation.status === "blocked_auth" || mutation.nextAttemptAt > now) {
      blockedThreads.add(threadKey);
      continue;
    }

    claimed = {
      ...mutation,
      status: "processing",
      attempts: mutation.attempts + 1,
      leaseOwner: ownerId,
      leaseExpiresAt: now + leaseMs,
      updatedAt: now,
    };
    await store.put(claimed);
    changed = true;
    break;
  }

  await transaction.done;
  if (changed) notifyMailMutationChange();
  return claimed ? toMailMutation(claimed) : undefined;
}

export async function renewMailMutationLease(
  id: string,
  {
    leaseMs,
    now = Date.now(),
    ownerId,
  }: { leaseMs: number; now?: number; ownerId: string },
) {
  const database = await getEmailCacheDatabase();
  if (!database) return false;
  const transaction = database.transaction("mailMutations", "readwrite");
  const store = transaction.objectStore("mailMutations");
  const mutation = await store.get(id);
  const renewed =
    mutation?.status === "processing" && mutation.leaseOwner === ownerId;
  if (renewed) {
    await store.put({
      ...mutation,
      leaseExpiresAt: now + leaseMs,
      updatedAt: now,
    });
  }
  await transaction.done;
  return renewed;
}

export async function markMailMutationAwaitingSync(
  id: string,
  result?: unknown,
  ownerId?: string,
) {
  await updateMutation(
    id,
    {
      status: "awaiting_sync",
      lastError: undefined,
      nextAttemptAt: 0,
      result,
    },
    ownerId,
  );
}

export async function claimNextMailMutationSyncGroup({
  leaseMs,
  now = Date.now(),
  ownerId,
}: {
  leaseMs: number;
  now?: number;
  ownerId: string;
}): Promise<MailMutationSyncGroup | undefined> {
  const database = await getEmailCacheDatabase();
  if (!database) return;
  const transaction = database.transaction("mailMutations", "readwrite");
  const store = transaction.objectStore("mailMutations");
  const groups = createStoredSyncGroups(
    await readActiveStoredMutations(store.index("byNextAttempt")),
  );
  let claimed: MailMutationSyncGroup | undefined;

  for (const group of groups) {
    if (
      group.mutations.some((mutation) =>
        isProviderActiveMailMutationStatus(mutation.status),
      )
    ) {
      continue;
    }
    const syncMutations = group.mutations.filter((mutation) =>
      isSyncMailMutationStatus(mutation.status),
    );
    if (!syncMutations.length) continue;
    if (
      syncMutations.some(
        (mutation) =>
          mutation.status === "awaiting_sync" && mutation.nextAttemptAt > now,
      ) ||
      syncMutations.some(
        (mutation) =>
          mutation.status === "reconciling" &&
          (mutation.leaseExpiresAt ?? Number.POSITIVE_INFINITY) > now,
      )
    ) {
      continue;
    }

    const claimedMutations: StoredMailMutation[] = [];
    for (const mutation of syncMutations) {
      const updated: StoredMailMutation = {
        ...mutation,
        status: "reconciling",
        syncAttempts: (mutation.syncAttempts ?? 0) + 1,
        leaseOwner: ownerId,
        leaseExpiresAt: now + leaseMs,
        updatedAt: now,
      };
      await store.put(updated);
      claimedMutations.push(updated);
    }
    claimed = {
      batchId: group.batchId,
      emailAccountId: group.emailAccountId,
      mutations: claimedMutations.map(toMailMutation),
    };
    break;
  }

  await transaction.done;
  if (claimed) notifyMailMutationChange();
  return claimed;
}

export async function renewMailMutationSyncGroupLease(
  group: Pick<MailMutationSyncGroup, "batchId" | "emailAccountId">,
  {
    leaseMs,
    now = Date.now(),
    ownerId,
  }: { leaseMs: number; now?: number; ownerId: string },
) {
  const database = await getEmailCacheDatabase();
  if (!database) return false;
  const transaction = database.transaction("mailMutations", "readwrite");
  const store = transaction.objectStore("mailMutations");
  const mutations = (await store.index("byBatch").getAll(group.batchId)).filter(
    (mutation) => mutation.emailAccountId === group.emailAccountId,
  );
  const reconciling = mutations.filter(
    (mutation) => mutation.status === "reconciling",
  );
  const renewed =
    reconciling.length > 0 &&
    reconciling.every((mutation) => mutation.leaseOwner === ownerId) &&
    !mutations.some(
      (mutation) =>
        isProviderActiveMailMutationStatus(mutation.status) ||
        mutation.status === "awaiting_sync",
    );
  if (renewed) {
    for (const mutation of reconciling) {
      await store.put({
        ...mutation,
        leaseExpiresAt: now + leaseMs,
        updatedAt: now,
      });
    }
  }
  await transaction.done;
  return renewed;
}

export async function completeMailMutationSyncGroup(
  group: Pick<MailMutationSyncGroup, "batchId" | "emailAccountId">,
  ownerId: string,
) {
  return updateMailMutationSyncGroup(group, ownerId, (mutation, now) => ({
    ...mutation,
    status: "succeeded",
    leaseOwner: undefined,
    leaseExpiresAt: undefined,
    lastError: undefined,
    updatedAt: now,
  }));
}

export async function retryMailMutationSyncGroup(
  group: Pick<MailMutationSyncGroup, "batchId" | "emailAccountId">,
  options: { error: string; nextAttemptAt: number },
  ownerId: string,
) {
  return updateMailMutationSyncGroup(group, ownerId, (mutation, now) => ({
    ...mutation,
    status: "awaiting_sync",
    leaseOwner: undefined,
    leaseExpiresAt: undefined,
    lastError: options.error,
    nextAttemptAt: options.nextAttemptAt,
    updatedAt: now,
  }));
}

export async function completeMailMutation(
  id: string,
  result?: unknown,
  ownerId?: string,
) {
  await updateMutation(
    id,
    {
      status: "succeeded",
      lastError: undefined,
      result,
    },
    ownerId,
  );
}

export async function claimNextMailMutationNotification(now = Date.now()) {
  const database = await getEmailCacheDatabase();
  if (!database) return;
  const transaction = database.transaction("mailMutations", "readwrite");
  const store = transaction.objectStore("mailMutations");
  const mutation = (await store.getAll()).find(
    (candidate) =>
      (candidate.status === "failed" || candidate.status === "uncertain") &&
      candidate.notificationShownAt === undefined,
  );
  if (mutation) {
    await store.put({ ...mutation, notificationShownAt: now });
  }
  await transaction.done;
  return mutation ? toMailMutation(mutation) : undefined;
}

export async function claimMailMutationNotification(
  id: string,
  now = Date.now(),
) {
  const database = await getEmailCacheDatabase();
  if (!database) return;
  const transaction = database.transaction("mailMutations", "readwrite");
  const store = transaction.objectStore("mailMutations");
  const mutation = await store.get(id);
  const claimed =
    mutation &&
    (mutation.status === "failed" || mutation.status === "uncertain") &&
    mutation.notificationShownAt === undefined
      ? mutation
      : undefined;
  if (claimed) await store.put({ ...claimed, notificationShownAt: now });
  await transaction.done;
  return claimed ? toMailMutation(claimed) : undefined;
}

export async function retryMailMutation(
  id: string,
  options: { error: string; nextAttemptAt: number },
  ownerId?: string,
) {
  await updateMutation(
    id,
    {
      status: "retry_wait",
      nextAttemptAt: options.nextAttemptAt,
      lastError: options.error,
    },
    ownerId,
  );
}

export async function blockMailMutationForAuth(
  id: string,
  error: string,
  ownerId?: string,
) {
  await updateMutation(
    id,
    { status: "blocked_auth", lastError: error },
    ownerId,
  );
}

export async function resumeBlockedMailMutations(now = Date.now()) {
  const database = await getEmailCacheDatabase();
  if (!database) return 0;
  const transaction = database.transaction("mailMutations", "readwrite");
  const store = transaction.objectStore("mailMutations");
  const mutations = await store.getAll();
  let resumed = 0;
  for (const mutation of mutations) {
    if (mutation.status !== "blocked_auth") continue;
    resumed += 1;
    await store.put({
      ...mutation,
      status: "pending",
      nextAttemptAt: now,
      updatedAt: now,
      lastError: undefined,
    });
  }
  await transaction.done;
  if (resumed) notifyMailMutationChange();
  return resumed;
}

export async function failMailMutation(
  id: string,
  status: "failed" | "uncertain",
  error: string,
  ownerId?: string,
) {
  await updateMutation(id, { status, lastError: error }, ownerId);
}

export async function cancelPendingMailMutation(id: string) {
  const database = await getEmailCacheDatabase();
  if (!database) return false;
  const transaction = database.transaction("mailMutations", "readwrite");
  const store = transaction.objectStore("mailMutations");
  const mutation = await store.get(id);
  const cancelled =
    mutation !== undefined &&
    (mutation.status === "pending" ||
      mutation.status === "retry_wait" ||
      mutation.status === "blocked_auth") &&
    !mutation.leaseOwner;
  if (cancelled) await store.delete(id);
  await transaction.done;
  if (cancelled) notifyMailMutationChange();
  return cancelled;
}

export function subscribeToMailMutations(
  listener: (mutations?: MailMutation[]) => void,
) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function enqueueInStore(
  store: MailMutationWriteStore,
  input: EnqueueMailMutationInput & { batchId: string; id: string },
  now: number,
) {
  if (input.kind === "set_read_state") {
    const sameThread = await store
      .index("byAccountThread")
      .getAll([input.emailAccountId, input.threadId]);
    const existing = sameThread.find(
      (mutation) =>
        mutation.kind === "set_read_state" &&
        (mutation.status === "pending" || mutation.status === "retry_wait") &&
        !mutation.leaseOwner,
    );
    if (existing) {
      const updated: StoredMailMutation = {
        ...existing,
        batchId: input.batchId,
        clientSource: input.clientSource,
        createdAt:
          existing.batchId === input.batchId ? existing.createdAt : now,
        messageIds: [...new Set(input.messageIds)],
        payload: { read: input.read },
        status: "pending",
        nextAttemptAt: now,
        updatedAt: now,
        lastError: undefined,
      };
      await store.put(updated);
      return updated;
    }
  }

  const stored: StoredMailMutation = {
    id: input.id,
    batchId: input.batchId,
    clientSource: input.clientSource,
    emailAccountId: input.emailAccountId,
    threadId: input.threadId,
    messageIds: [...new Set(input.messageIds)],
    kind: input.kind,
    payload: getStoredPayload(input),
    status: "pending",
    attempts: 0,
    syncAttempts: 0,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  };
  await store.add(stored);
  return stored;
}

async function updateMailMutationSyncGroup(
  group: Pick<MailMutationSyncGroup, "batchId" | "emailAccountId">,
  ownerId: string,
  update: (mutation: StoredMailMutation, now: number) => StoredMailMutation,
) {
  const database = await getEmailCacheDatabase();
  if (!database) return [];
  const transaction = database.transaction("mailMutations", "readwrite");
  const store = transaction.objectStore("mailMutations");
  const mutations = (await store.index("byBatch").getAll(group.batchId)).filter(
    (mutation) => mutation.emailAccountId === group.emailAccountId,
  );
  const canUpdate =
    mutations.some((mutation) => mutation.status === "reconciling") &&
    !mutations.some(
      (mutation) =>
        isProviderActiveMailMutationStatus(mutation.status) ||
        mutation.status === "awaiting_sync" ||
        (mutation.status === "reconciling" && mutation.leaseOwner !== ownerId),
    );
  const updated: StoredMailMutation[] = [];
  if (canUpdate) {
    const now = Date.now();
    for (const mutation of mutations) {
      if (mutation.status !== "reconciling") continue;
      const next = update(mutation, now);
      await store.put(next);
      updated.push(next);
    }
  }
  await transaction.done;
  if (updated.length) notifyMailMutationChange();
  return updated.map(toMailMutation);
}

async function updateMutation(
  id: string,
  update: Partial<StoredMailMutation>,
  ownerId?: string,
) {
  const database = await getEmailCacheDatabase();
  if (!database) return;
  const transaction = database.transaction("mailMutations", "readwrite");
  const store = transaction.objectStore("mailMutations");
  const mutation = await store.get(id);
  const canUpdate =
    mutation && (ownerId === undefined || mutation.leaseOwner === ownerId);
  if (canUpdate) {
    await store.put({
      ...mutation,
      ...update,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      updatedAt: Date.now(),
    });
  }
  await transaction.done;
  if (canUpdate) notifyMailMutationChange();
}

function getStoredPayload(input: EnqueueMailMutationInput): unknown {
  if (input.kind === "archive") {
    return input.labelId ? { labelId: input.labelId } : {};
  }
  if (input.kind === "set_read_state") return { read: input.read };
  if (input.kind === "snooze") return { scheduledFor: input.scheduledFor };
  if (input.kind === "cancel_snooze") {
    return { snoozeMutationId: input.snoozeMutationId };
  }
  if (input.kind === "reply") return { email: input.email };
  return {};
}

function toMailMutation(stored: StoredMailMutation): MailMutation {
  return { ...stored, ...(stored.payload as object) } as MailMutation;
}

function compareMutations(left: StoredMailMutation, right: StoredMailMutation) {
  return left.createdAt - right.createdAt || left.id.localeCompare(right.id);
}

function createStoredSyncGroups(mutations: StoredMailMutation[]) {
  const accounts = new Map<string, Map<string, StoredMailMutationSyncGroup>>();
  for (const mutation of [...mutations].sort(compareMutations)) {
    let batches = accounts.get(mutation.emailAccountId);
    if (!batches) {
      batches = new Map();
      accounts.set(mutation.emailAccountId, batches);
    }
    let group = batches.get(mutation.batchId);
    if (!group) {
      group = {
        batchId: mutation.batchId,
        emailAccountId: mutation.emailAccountId,
        mutations: [],
      };
      batches.set(mutation.batchId, group);
    }
    group.mutations.push(mutation);
  }
  return [...accounts.values()]
    .flatMap((batches) => [...batches.values()])
    .sort(compareStoredSyncGroups);
}

function compareStoredSyncGroups(
  left: StoredMailMutationSyncGroup,
  right: StoredMailMutationSyncGroup,
) {
  const leftFirst = left.mutations[0];
  const rightFirst = right.mutations[0];
  if (!leftFirst) return rightFirst ? 1 : 0;
  if (!rightFirst) return -1;
  return compareMutations(leftFirst, rightFirst);
}

function isProviderActiveMailMutationStatus(
  status: StoredMailMutation["status"],
) {
  return PROVIDER_ACTIVE_STATUSES.has(status);
}

function isSyncMailMutationStatus(status: StoredMailMutation["status"]) {
  return status === "awaiting_sync" || status === "reconciling";
}

function readActiveStoredMutations(index: {
  getAll(query: IDBKeyRange): Promise<StoredMailMutation[]>;
}) {
  return Promise.all(
    ACTIVE_STATUS_VALUES.map((status) =>
      index.getAll(
        IDBKeyRange.bound(
          [status, Number.MIN_SAFE_INTEGER],
          [status, Number.MAX_SAFE_INTEGER],
        ),
      ),
    ),
  ).then((mutations) => mutations.flat());
}

function notifyMailMutationChange(mutations?: MailMutation[]) {
  notifyListeners(mutations);
  channel?.postMessage(
    mutations?.length
      ? { mutationIds: mutations.map((mutation) => mutation.id) }
      : null,
  );
}

function notifyListeners(mutations?: MailMutation[]) {
  for (const listener of listeners) listener(mutations);
}

function getMutationChangeIds(value: unknown) {
  if (!value || typeof value !== "object" || !("mutationIds" in value)) {
    return;
  }
  const { mutationIds } = value;
  return Array.isArray(mutationIds)
    ? mutationIds.filter((id): id is string => typeof id === "string")
    : undefined;
}

type MailMutationWriteStore = {
  add(mutation: StoredMailMutation): Promise<unknown>;
  index(name: "byAccountThread"): {
    getAll(query: [string, string]): Promise<StoredMailMutation[]>;
  };
  put(mutation: StoredMailMutation): Promise<unknown>;
};

type StoredMailMutationSyncGroup = {
  batchId: string;
  emailAccountId: string;
  mutations: StoredMailMutation[];
};
