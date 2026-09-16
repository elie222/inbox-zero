import { createSearchIndexClient } from "./search-index-client";
import { querySearchIndex } from "./search-index-query";
import {
  initializeSearchIndexAccount,
  seedSearchIndexWork,
} from "./search-index-seed";
import { drainSearchIndexWork } from "./search-index-drain";
import { readSearchIndexWork } from "./search-index-work";
import { isMailSyncActivated } from "./mail-activation";
import {
  notifyEmailCacheChange,
  subscribeToEmailCacheChanges,
} from "./cache-events";
import type { LocalSearchRequest } from "./search";

let client: ReturnType<typeof createSearchIndexClient> | undefined;
const retained = new Map<
  string,
  {
    users: number;
    running: boolean;
    rerun: boolean;
    warmed?: string;
    nextAttemptAt?: number;
    dispose: () => void;
    timer?: ReturnType<typeof setTimeout>;
  }
>();

export function retainSearchIndex(emailAccountId: string) {
  if (!isMailSyncActivated(emailAccountId)) return () => {};
  let state = retained.get(emailAccountId);
  if (state) {
    state.users++;
    return () => release(emailAccountId);
  }
  state = { users: 1, running: false, rerun: false, dispose: () => {} };
  retained.set(emailAccountId, state);
  const wake = () => schedule(emailAccountId);
  const unsubscribe = subscribeToEmailCacheChanges(
    ({ emailAccountId: changed }) => {
      if (!changed || changed === emailAccountId) wake();
    },
  );
  document.addEventListener("visibilitychange", wake);
  state.dispose = () => {
    unsubscribe();
    document.removeEventListener("visibilitychange", wake);
  };
  schedule(emailAccountId);
  return () => release(emailAccountId);
}

export function searchPersistentMail(request: LocalSearchRequest) {
  client ??= createSearchIndexClient();
  return querySearchIndex(client, request);
}

export async function cleanupSearchIndex(
  emailAccountId?: string,
  generation?: string,
) {
  client ??= createSearchIndexClient();
  if (!emailAccountId) {
    const clearing = client;
    const result = await clearing.clearAll();
    if ("result" in result && result.result === true && client === clearing) {
      clearing.close();
      client = undefined;
    }
  } else if (generation)
    await client.cleanupAccount({ emailAccountId, generation });
  else await client.cleanupRemovedAccounts();
}

function release(emailAccountId: string) {
  const state = retained.get(emailAccountId);
  if (!state || --state.users > 0) return;
  clearTimeout(state.timer);
  state.dispose();
  retained.delete(emailAccountId);
}

function schedule(emailAccountId: string, delay = 200) {
  const state = retained.get(emailAccountId);
  if (state?.running) {
    state.rerun = true;
    return;
  }
  if (
    !state ||
    state.timer ||
    document.visibilityState === "hidden" ||
    !isMailSyncActivated(emailAccountId)
  )
    return;
  const waitMs = Math.max(delay, (state.nextAttemptAt ?? 0) - Date.now());
  state.timer = setTimeout(async () => {
    state.timer = undefined;
    if (
      document.visibilityState === "hidden" ||
      !isMailSyncActivated(emailAccountId)
    )
      return;
    state.running = true;
    state.rerun = false;
    let again = false;
    try {
      const account = await initializeSearchIndexAccount(emailAccountId);
      if (!account) return;
      if (account.seed) {
        const seeded = await seedSearchIndexWork(emailAccountId);
        again = !!seeded && !seeded.complete;
        notifyEmailCacheChange(emailAccountId);
      }
      if (!again) {
        if (state.warmed !== account.generation) {
          client ??= createSearchIndexClient();
          const warmed = await client.request(
            { emailAccountId, generation: account.generation },
            { command: "state", emailAccountId },
          );
          if ("error" in warmed) return;
          state.warmed = account.generation;
        }
        const work = await readSearchIndexWork(emailAccountId);
        if (work?.work.length) {
          client ??= createSearchIndexClient();
          const drained = await drainSearchIndexWork(client, emailAccountId);
          again =
            drained.status === "ready"
              ? drained.hasMore
              : drained.status === "stale" || drained.status === "busy";
          if (drained.status === "storage-full") {
            state.nextAttemptAt = Date.now() + 60_000;
            again = true;
          } else if (drained.status === "ready") {
            state.nextAttemptAt = undefined;
            notifyEmailCacheChange(emailAccountId);
          }
        }
      }
    } catch {
      // A storage failure leaves provider search and the existing cache available.
    } finally {
      state.running = false;
      if ((again || state.rerun) && retained.get(emailAccountId) === state)
        schedule(emailAccountId, 200);
    }
  }, waitMs);
}
