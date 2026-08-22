"use client";

import { useEffect } from "react";
import {
  fetchMailboxSyncPage,
  syncMailboxPages,
} from "@/utils/email-cache/mailbox-sync";

const COMPLETE_SYNC_INTERVAL_MS = 60_000;
const CONTINUATION_DELAY_MS = 10_000;
const inFlightSyncs = new Map<
  string,
  Promise<{ hasMore: boolean; pagesSynced: number }>
>();
const syncRequestListeners = new Set<(emailAccountId: string) => void>();

export function useMailboxSync({
  emailAccountId,
  enabled,
}: {
  emailAccountId: string;
  enabled: boolean;
}) {
  useEffect(() => {
    if (!enabled || !emailAccountId) return;
    let cancelled = false;
    let running = false;
    let rerunRequested = false;
    let timeout: ReturnType<typeof setTimeout> | undefined;

    const schedule = (delay: number) => {
      clearTimeout(timeout);
      if (!cancelled) timeout = setTimeout(run, delay);
    };
    const run = () => {
      if (cancelled) return;
      if (running) {
        rerunRequested = true;
        return;
      }
      if (document.visibilityState === "hidden" || navigator.onLine === false) {
        schedule(COMPLETE_SYNC_INTERVAL_MS);
        return;
      }
      running = true;
      runSharedMailboxSync(emailAccountId)
        .then(({ hasMore }) => {
          if (!rerunRequested) {
            schedule(
              hasMore ? CONTINUATION_DELAY_MS : COMPLETE_SYNC_INTERVAL_MS,
            );
          }
        })
        .catch(() => {
          if (!rerunRequested) schedule(COMPLETE_SYNC_INTERVAL_MS);
        })
        .finally(() => {
          running = false;
          if (rerunRequested) {
            rerunRequested = false;
            schedule(0);
          }
        });
    };
    const requestSync = (requestedAccountId: string) => {
      if (requestedAccountId !== emailAccountId) return;
      if (running) rerunRequested = true;
      else schedule(0);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") schedule(0);
    };

    syncRequestListeners.add(requestSync);
    window.addEventListener("focus", run);
    window.addEventListener("online", run);
    document.addEventListener("visibilitychange", onVisible);
    run();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      syncRequestListeners.delete(requestSync);
      window.removeEventListener("focus", run);
      window.removeEventListener("online", run);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [emailAccountId, enabled]);
}

export function requestMailboxSync(emailAccountId: string) {
  for (const listener of syncRequestListeners) listener(emailAccountId);
}

function runSharedMailboxSync(emailAccountId: string) {
  const existing = inFlightSyncs.get(emailAccountId);
  if (existing) return existing;

  const sync = syncMailboxPages({
    emailAccountId,
    fetchPage: (input) => fetchMailboxSyncPage(emailAccountId, input),
    maxPages: 1,
  }).finally(() => {
    if (inFlightSyncs.get(emailAccountId) === sync) {
      inFlightSyncs.delete(emailAccountId);
    }
  });
  inFlightSyncs.set(emailAccountId, sync);
  return sync;
}
