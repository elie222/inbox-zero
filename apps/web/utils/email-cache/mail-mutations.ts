import type { SendEmailBody } from "@/utils/gmail/mail";
import { getEmailCacheDatabase, type StoredMailMutation } from "./database";

export type MailMutationPayload =
  | { kind: "archive" }
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
  emailAccountId: string;
  threadId: string;
  messageIds: string[];
};

const ACTIVE_STATUS_VALUES = [
  "pending",
  "processing",
  "retry_wait",
  "blocked_auth",
] as const satisfies StoredMailMutation["status"][];
const ACTIVE_STATUSES = new Set<StoredMailMutation["status"]>(
  ACTIVE_STATUS_VALUES,
);

const listeners = new Set<() => void>();
const channel =
  typeof window === "undefined" || typeof BroadcastChannel === "undefined"
    ? null
    : new BroadcastChannel("inbox-zero-mail-mutations");

channel?.addEventListener("message", () => notifyListeners());

export async function enqueueMailMutation(
  input: EnqueueMailMutationInput,
  now = Date.now(),
): Promise<MailMutation> {
  const database = await getEmailCacheDatabase();
  if (!database) throw new Error("Offline mail storage is unavailable");

  const transaction = database.transaction("mailMutations", "readwrite");
  const store = transaction.objectStore("mailMutations");

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
        messageIds: [...new Set(input.messageIds)],
        payload: { read: input.read },
        status: "pending",
        nextAttemptAt: now,
        updatedAt: now,
        lastError: undefined,
      };
      await store.put(updated);
      await transaction.done;
      notifyMailMutationChange();
      return toMailMutation(updated);
    }
  }

  const id = input.id ?? crypto.randomUUID();
  const stored: StoredMailMutation = {
    id,
    batchId: input.batchId ?? id,
    emailAccountId: input.emailAccountId,
    threadId: input.threadId,
    messageIds: [...new Set(input.messageIds)],
    kind: input.kind,
    payload: getStoredPayload(input),
    status: "pending",
    attempts: 0,
    nextAttemptAt: now,
    createdAt: now,
    updatedAt: now,
  };
  await store.add(stored);
  await transaction.done;
  notifyMailMutationChange();
  return toMailMutation(stored);
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
    .filter((mutation) => ACTIVE_STATUSES.has(mutation.status))
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
    if (!ACTIVE_STATUSES.has(mutation.status)) continue;
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
    if (!ACTIVE_STATUSES.has(mutation.status)) continue;
    const threadKey = `${mutation.emailAccountId}\u0000${mutation.threadId}`;
    if (blockedThreads.has(threadKey)) continue;

    if (
      mutation.status === "processing" &&
      (mutation.leaseExpiresAt ?? Number.POSITIVE_INFINITY) > now
    ) {
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

export async function completeMailMutation(id: string, result?: unknown) {
  await updateMutation(id, {
    status: "succeeded",
    lastError: undefined,
    result,
  });
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
) {
  await updateMutation(id, {
    status: "retry_wait",
    nextAttemptAt: options.nextAttemptAt,
    lastError: options.error,
  });
}

export async function blockMailMutationForAuth(id: string, error: string) {
  await updateMutation(id, { status: "blocked_auth", lastError: error });
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
) {
  await updateMutation(id, { status, lastError: error });
}

export async function cancelPendingMailMutation(id: string) {
  const database = await getEmailCacheDatabase();
  if (!database) return false;
  const transaction = database.transaction("mailMutations", "readwrite");
  const store = transaction.objectStore("mailMutations");
  const mutation = await store.get(id);
  const cancelled =
    Boolean(mutation) &&
    (mutation?.status === "pending" ||
      mutation?.status === "retry_wait" ||
      mutation?.status === "blocked_auth") &&
    !mutation?.leaseOwner;
  if (cancelled) await store.delete(id);
  await transaction.done;
  if (cancelled) notifyMailMutationChange();
  return cancelled;
}

export function subscribeToMailMutations(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

async function updateMutation(id: string, update: Partial<StoredMailMutation>) {
  const database = await getEmailCacheDatabase();
  if (!database) return;
  const transaction = database.transaction("mailMutations", "readwrite");
  const store = transaction.objectStore("mailMutations");
  const mutation = await store.get(id);
  if (mutation) {
    await store.put({
      ...mutation,
      ...update,
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      updatedAt: Date.now(),
    });
  }
  await transaction.done;
  if (mutation) notifyMailMutationChange();
}

function getStoredPayload(input: EnqueueMailMutationInput): unknown {
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

function notifyMailMutationChange() {
  notifyListeners();
  channel?.postMessage(null);
}

function notifyListeners() {
  for (const listener of listeners) listener();
}
