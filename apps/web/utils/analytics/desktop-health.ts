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
    ...durationProperties("mail_command", child?.mailCommandMs),
    ...mailSyncProperties(child?.mailSync),
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

function mailSyncProperties(
  accounts: NonNullable<
    NonNullable<DesktopHealth["engine"]>["child"]
  >["mailSync"],
) {
  if (!accounts) return {};
  const inboxAges = presentNumbers(
    accounts.map((account) => account.newestInboxMessageAgeMs),
  );
  const caughtUpAges = presentNumbers(
    accounts.map((account) => account.oldestStreamCaughtUpAgeMs),
  );
  return {
    mail_accounts: accounts.length,
    mail_accounts_offline: accounts.filter(
      (account) => account.connection === "offline",
    ).length,
    mail_accounts_blocked_auth: accounts.filter(
      (account) => account.connection === "blocked_auth",
    ).length,
    mail_streams: sum(accounts.map((account) => account.streams)),
    mail_streams_behind: sum(accounts.map((account) => account.streamsBehind)),
    mail_streams_paused: sum(accounts.map((account) => account.streamsPaused)),
    ...(inboxAges.length
      ? {
          mail_inbox_newest_age_min_ms: Math.min(...inboxAges),
          mail_inbox_newest_age_max_ms: Math.max(...inboxAges),
        }
      : {}),
    ...(caughtUpAges.length
      ? { mail_stream_caught_up_age_max_ms: Math.max(...caughtUpAges) }
      : {}),
  };
}

function presentNumbers(values: Array<number | null>) {
  return values.filter((value): value is number => value !== null);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}
