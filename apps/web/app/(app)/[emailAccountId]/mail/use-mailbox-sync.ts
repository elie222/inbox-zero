"use client";

import { useEffect, useRef } from "react";
import { getInboxZeroDesktopApp } from "@/utils/desktop-app";
import { trackMailboxSyncResult } from "@/utils/email-cache/analytics";
import {
  fetchMailboxSyncPage,
  syncMailboxPages,
} from "@/utils/email-cache/mailbox-sync";
import { createMailboxSyncScheduler } from "./mailbox-sync-scheduler";

const COMPLETE_SYNC_INTERVAL_MS = 60_000;
const CONTINUATION_DELAY_MS = 10_000;
const MAX_CONCURRENT_MAILBOX_SYNCS = 2;
const MAX_RETRY_DELAY_MS = 15 * 60_000;
const MAX_TIMEOUT_MS = 2_147_483_647;
const STEADY_SYNC_TELEMETRY_INTERVAL_MS = 15 * 60_000;
const syncRequestListeners = new Set<(emailAccountId: string) => void>();
const mailboxSyncScheduler = createMailboxSyncScheduler({
  maxConcurrent: MAX_CONCURRENT_MAILBOX_SYNCS,
  sync: (emailAccountId) =>
    syncMailboxPages({
      emailAccountId,
      fetchPage: (input) => fetchMailboxSyncPage(emailAccountId, input),
      maxPages: 1,
    }),
});

export function useMailboxSync({
  emailAccountId,
  enabled,
  priority = false,
}: {
  emailAccountId: string;
  enabled: boolean;
  priority?: boolean;
}) {
  const priorityRef = useRef(priority);

  useEffect(() => {
    if (!enabled || !emailAccountId) return;
    priorityRef.current = priority;
    mailboxSyncScheduler.setPriority({ emailAccountId, priority });
  }, [emailAccountId, enabled, priority]);

  useEffect(() => {
    if (!enabled || !emailAccountId) return;
    let cancelled = false;
    let attempts = 0;
    let catchingUp = false;
    let consecutiveFailures = 0;
    const desktop = getInboxZeroDesktopApp();
    let lastSteadyTelemetryAt = 0;
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
      if (
        navigator.onLine === false ||
        (document.visibilityState === "hidden" && !desktop)
      ) {
        schedule(COMPLETE_SYNC_INTERVAL_MS);
        return;
      }
      running = true;
      const initial = attempts === 0;
      const startedAt = performance.now();
      attempts += 1;
      mailboxSyncScheduler
        .run({ emailAccountId, priority: priorityRef.current })
        .then(({ hasMore, pagesSynced }) => {
          const catchUpCompleted = catchingUp && !hasMore;
          const shouldTrackSteadySync =
            Date.now() - lastSteadyTelemetryAt >=
            STEADY_SYNC_TELEMETRY_INTERVAL_MS;
          let phase: "catch_up_complete" | "initial" | "poll" | undefined;
          if (initial) phase = "initial";
          else if (catchUpCompleted) phase = "catch_up_complete";
          else if (shouldTrackSteadySync) phase = "poll";
          if (phase) {
            trackMailboxSyncResult({
              durationMs: performance.now() - startedAt,
              hasMore,
              outcome: "success",
              pagesSynced,
              phase,
            });
            lastSteadyTelemetryAt = Date.now();
          }
          catchingUp = hasMore;
          consecutiveFailures = 0;
          if (!rerunRequested) {
            schedule(
              hasMore ? CONTINUATION_DELAY_MS : COMPLETE_SYNC_INTERVAL_MS,
            );
          }
        })
        .catch((error: unknown) => {
          consecutiveFailures += 1;
          const retryDelayMs = getRetryDelay(
            consecutiveFailures,
            getRetryAfterMs(error),
          );
          trackMailboxSyncResult({
            consecutiveFailures,
            durationMs: performance.now() - startedAt,
            outcome: "failure",
            pagesSynced: 0,
            phase: "retry",
            retryDelayMs,
          });
          if (!rerunRequested) schedule(retryDelayMs);
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

export function syncMailboxNow(emailAccountId: string) {
  return mailboxSyncScheduler.runAfterCurrent({
    emailAccountId,
    priority: true,
  });
}

function getRetryDelay(consecutiveFailures: number, retryAfterMs?: number) {
  const exponentialDelay = Math.min(
    COMPLETE_SYNC_INTERVAL_MS * 2 ** (consecutiveFailures - 1),
    MAX_RETRY_DELAY_MS,
  );
  const jitteredDelay = Math.min(
    Math.round(exponentialDelay * (0.8 + Math.random() * 0.4)),
    MAX_RETRY_DELAY_MS,
  );
  return Math.max(jitteredDelay, Math.min(retryAfterMs ?? 0, MAX_TIMEOUT_MS));
}

function getRetryAfterMs(error: unknown) {
  if (
    typeof error === "object" &&
    error !== null &&
    "retryAfterMs" in error &&
    typeof error.retryAfterMs === "number"
  ) {
    return error.retryAfterMs;
  }
}
