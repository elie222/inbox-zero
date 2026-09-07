import { unstable_serialize, type Cache, type ScopedMutator } from "swr";

import {
  captureEmailCacheEpoch,
  getEmailCacheDatabase,
  isEmailCacheEpochCurrent,
} from "./database";
import { createThreadDetailRequestKey, getThreadDetailKeyRange } from "./keys";

type ThreadInvalidation = {
  emailAccountId: string;
  threadIds: string[];
  reset: boolean;
};

const listeners = new Set<(change: ThreadInvalidation) => void>();
const versions = new Map<
  string,
  { account: number; threads: Map<string, number> }
>();

const channel =
  typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel("inbox-zero-thread-invalidation")
    : null;
channel?.addEventListener("message", (event) => {
  const change = event.data;
  if (
    typeof change?.emailAccountId === "string" &&
    typeof change.reset === "boolean" &&
    Array.isArray(change.threadIds) &&
    change.threadIds.every((id: unknown) => typeof id === "string")
  )
    invalidatePersistedThreadCaches(change).catch(() => {});
});

export function getThreadCacheVersion(
  emailAccountId: string,
  threadId: string,
) {
  let state = versions.get(emailAccountId);
  if (!state) {
    state = { account: 0, threads: new Map() };
    versions.set(emailAccountId, state);
  }
  if (!state.threads.has(threadId)) state.threads.set(threadId, 0);
  return `${state.account}:${state.threads.get(threadId)}`;
}

export function invalidateThreadCaches(change: ThreadInvalidation) {
  if (!change.reset && !change.threadIds.length) return;
  applyThreadInvalidation(change);
  channel?.postMessage(change);
}

export function connectThreadCacheInvalidation(
  cache: Cache,
  mutate: ScopedMutator,
) {
  const listener = ({
    emailAccountId,
    threadIds,
    reset,
  }: ThreadInvalidation) => {
    const invalidatedKeys = new Set<string>();
    const affectedIds = new Set(threadIds);
    if (reset) {
      for (const key of cache.keys()) {
        const threadId = cache.get(key)?.data?.thread?.id;
        if (typeof threadId === "string") affectedIds.add(threadId);
      }
    }
    for (const threadId of affectedIds) {
      for (const includeDrafts of [false, true]) {
        for (const parseReplies of [false, true]) {
          const key = unstable_serialize(
            createThreadDetailRequestKey({
              emailAccountId,
              threadId,
              options: { includeDrafts, parseReplies },
            }),
          );
          if (!cache.get(key)) continue;
          // Prefetched entries aren't reached by SWR's original-key filter.
          invalidatedKeys.add(key);
          mutate(key, undefined, { revalidate: true }).catch(() => {});
        }
      }
    }
    if (!reset) return;
    mutate(
      (key) => {
        if (
          !Array.isArray(key) ||
          key[1] !== emailAccountId ||
          typeof key[0] !== "string" ||
          invalidatedKeys.has(unstable_serialize(key))
        )
          return false;
        const path = key[0].split("?")[0];
        return path.startsWith("/api/threads/");
      },
      undefined,
      { revalidate: true },
    ).catch(() => {});
  };
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function invalidatePersistedThreadCaches(change: ThreadInvalidation) {
  const epoch = captureEmailCacheEpoch(change.emailAccountId);
  advanceThreadCacheVersions(change);
  try {
    const database = await getEmailCacheDatabase();
    if (!database || !isEmailCacheEpochCurrent(change.emailAccountId, epoch))
      return;
    const transaction = database.transaction("threadDetails", "readwrite");
    const store = transaction.store;
    const keys = change.reset
      ? await store.index("byAccount").getAllKeys(change.emailAccountId)
      : (
          await Promise.all(
            change.threadIds.map((threadId) =>
              store.getAllKeys(
                getThreadDetailKeyRange(change.emailAccountId, threadId),
              ),
            ),
          )
        ).flat();
    await Promise.all(keys.map((key) => store.delete(key)));
    await transaction.done;
  } finally {
    // Also reject reads that started while the cross-tab deletion was pending.
    if (isEmailCacheEpochCurrent(change.emailAccountId, epoch))
      applyThreadInvalidation(change);
  }
}

function applyThreadInvalidation(change: ThreadInvalidation) {
  advanceThreadCacheVersions(change);
  for (const listener of listeners) listener(change);
}

function advanceThreadCacheVersions(change: ThreadInvalidation) {
  const state = versions.get(change.emailAccountId);
  if (state) {
    if (change.reset) {
      state.account += 1;
      state.threads.clear();
    } else {
      for (const id of change.threadIds) {
        const version = state.threads.get(id);
        if (version !== undefined) state.threads.set(id, version + 1);
      }
    }
  }
}
