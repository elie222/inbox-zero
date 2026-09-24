import posthog from "posthog-js";
import { MAIL_ANALYTICS_EVENTS } from "@/utils/analytics/product";
import { runWhenIdle } from "@/utils/analytics/summary-flush";
import {
  type DesktopHealth,
  getInboxZeroDesktopApp,
} from "@/utils/desktop-app";

const FIRST_REPORT_DELAY_MS = 2 * 60 * 1000;
const REPORT_INTERVAL_MS = 60 * 60 * 1000;

/** Desktop builds without the health bridge report nothing. */
export function startDesktopHealthReporting() {
  const getDesktopHealth = getInboxZeroDesktopApp()?.getDesktopHealth;
  if (!getDesktopHealth) return;

  const report = () =>
    runWhenIdle(() => {
      getDesktopHealth()
        .then((health) => {
          if (!health) return;
          posthog.capture(
            MAIL_ANALYTICS_EVENTS.desktopHealthSummary,
            buildDesktopHealthProperties(health),
          );
        })
        .catch(() => undefined);
    });
  setTimeout(report, FIRST_REPORT_DELAY_MS);
  setInterval(report, REPORT_INTERVAL_MS);
}

export function buildDesktopHealthProperties(health: DesktopHealth) {
  const child = health.engine?.child;
  return {
    desktop_version: health.version,
    interval_ms: health.intervalMs,
    mailbox_bytes: health.mailboxBytes,
    engine_running: health.engine?.running ?? false,
    engine_restarts: health.engine?.restarts ?? 0,
    ...durationProperties("main_loop_delay", health.mainEventLoopDelayMs),
    ...durationProperties("engine_loop_delay", child?.eventLoopDelayMs),
    ...durationProperties("sqlite_read", child?.sqliteReadMs),
    ...durationProperties("sqlite_write", child?.sqliteWriteMs),
  };
}

function durationProperties(
  metric: string,
  summary: DesktopHealth["mainEventLoopDelayMs"] | undefined,
) {
  if (!summary) return {};
  return {
    [`${metric}_count`]: summary.count,
    [`${metric}_p50_ms`]: summary.p50Ms,
    [`${metric}_p95_ms`]: summary.p95Ms,
    [`${metric}_max_ms`]: summary.maxMs,
  };
}
