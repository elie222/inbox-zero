import posthog from "posthog-js";

const SUMMARY_FLUSH_INTERVAL_MS = 5 * 60 * 1000;

type CaptureSummary = (
  event: string,
  properties: Record<string, unknown>,
) => void;

/**
 * Calls `flush` every few minutes and as soon as the page is hidden, since a
 * hidden page may be discarded without ever becoming visible again.
 */
export function scheduleSummaryFlush(flush: (capture: CaptureSummary) => void) {
  setInterval(
    () => runWhenIdle(() => flush(captureQueued)),
    SUMMARY_FLUSH_INTERVAL_MS,
  );

  const flushNow = () => flush(captureWithBeacon);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushNow();
  });
  window.addEventListener("pagehide", flushNow);
}

export function runWhenIdle(callback: () => void) {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(callback, { timeout: 2000 });
  } else {
    setTimeout(callback, 0);
  }
}

function captureQueued(event: string, properties: Record<string, unknown>) {
  posthog.capture(event, properties);
}

// PostHog's batch queue is drained on its own `pagehide` listener, which may
// already have run, so hidden-page summaries skip the queue.
function captureWithBeacon(event: string, properties: Record<string, unknown>) {
  posthog.capture(event, properties, { transport: "sendBeacon" });
}
