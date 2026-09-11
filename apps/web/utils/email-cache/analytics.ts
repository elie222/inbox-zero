import posthog from "posthog-js";
import { getInboxZeroDesktopApp } from "@/utils/desktop-app";

let storageEstimateCaptured = false;

export function trackMailboxListReady({
  durationMs,
  source,
  threadCount,
}: {
  durationMs: number;
  source: "mailbox" | "persistent" | "remote";
  threadCount: number;
}) {
  capture("mailbox_list_ready", {
    duration_ms: Math.max(0, Math.round(durationMs)),
    runtime: getInboxZeroDesktopApp() ? "desktop" : "web",
    source,
    thread_count: threadCount,
  });
}

export function trackMailboxSyncResult({
  consecutiveFailures,
  durationMs,
  hasMore,
  outcome,
  pagesSynced,
  phase,
  retryDelayMs,
}: {
  consecutiveFailures?: number;
  durationMs: number;
  hasMore?: boolean;
  outcome: "failure" | "success";
  pagesSynced: number;
  phase: "catch_up_complete" | "initial" | "poll" | "retry";
  retryDelayMs?: number;
}) {
  capture("mailbox_sync_result", {
    consecutive_failures: consecutiveFailures,
    duration_ms: Math.max(0, Math.round(durationMs)),
    has_more: hasMore,
    outcome,
    pages_synced: pagesSynced,
    phase,
    retry_delay_ms: retryDelayMs,
    runtime: getInboxZeroDesktopApp() ? "desktop" : "web",
  });

  if (outcome === "success") captureStorageEstimate();
}

function captureStorageEstimate() {
  if (storageEstimateCaptured || !navigator.storage?.estimate) return;
  storageEstimateCaptured = true;

  try {
    navigator.storage
      .estimate()
      .then(({ quota, usage }) => {
        capture("email_cache_storage_estimated", {
          quota_bytes: quota,
          runtime: getInboxZeroDesktopApp() ? "desktop" : "web",
          usage_bytes: usage,
          usage_ratio: quota && usage !== undefined ? usage / quota : undefined,
        });
      })
      .catch(() => {});
  } catch {}
}

function capture(event: string, properties: Record<string, unknown>) {
  try {
    posthog.capture(event, properties);
  } catch {}
}
