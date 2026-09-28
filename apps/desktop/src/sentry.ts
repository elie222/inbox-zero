import * as Sentry from "@sentry/electron/main";
import type { Breadcrumb, ErrorEvent } from "@sentry/electron/main";
import { app } from "electron";

// Injected at build time; development and self-hosted builds leave it empty.
const DSN = process.env.INBOX_ZERO_SENTRY_DSN;
// The mail engine and updater retry on their own, so a persistent failure
// would otherwise report on every attempt.
const REPEAT_REPORT_INTERVAL_MS = 10 * 60 * 1000;
const lastReportedAt = new Map<string, number>();
const DIAGNOSTICS_UPLOAD_TIMEOUT_MS = 60_000;

/**
 * Reports main-process errors, renderer/GPU process crashes, and native
 * minidumps. The hosted web app reports its own renderer errors separately.
 */
export function initDesktopSentry() {
  if (!DSN) return;
  Sentry.init({
    dsn: DSN,
    release: `desktop@${app.getVersion()}`,
    environment: app.isPackaged ? "production" : "development",
    sendDefaultPii: false,
    beforeBreadcrumb: scrubBreadcrumb,
    beforeSend: scrubEvent,
  });
}

export function captureDesktopError(
  error: unknown,
  tags: Record<string, string>,
  {
    extra,
    now = Date.now(),
  }: { extra?: Record<string, unknown>; now?: number } = {},
) {
  if (!DSN) return;
  const key = `${JSON.stringify(tags)}:${error instanceof Error ? error.message : String(error)}`;
  const last = lastReportedAt.get(key);
  if (last !== undefined && now - last < REPEAT_REPORT_INTERVAL_MS) return;
  if (lastReportedAt.size >= 200) lastReportedAt.clear();
  lastReportedAt.set(key, now);
  Sentry.captureException(error, { tags, extra });
}

export function isDesktopSentryEnabled() {
  return Boolean(DSN);
}

/** Resolves to the event id to quote to support, or null if it didn't send. */
export async function sendDesktopDiagnostics(
  attachments: Array<{ filename: string; data: Uint8Array }>,
) {
  if (!DSN) return null;
  const eventId = Sentry.withScope((scope) => {
    scope.setTag("area", "diagnostics");
    for (const attachment of attachments) scope.addAttachment(attachment);
    return Sentry.captureMessage("User diagnostics", "info");
  });
  const sent = await Sentry.flush(DIAGNOSTICS_UPLOAD_TIMEOUT_MS);
  return sent ? eventId : null;
}

// Native renderer crashes carry the crashed page URL, which can include query
// strings, outside the breadcrumbs.
export function scrubEvent(event: ErrorEvent): ErrorEvent {
  const electron = event.contexts?.electron;
  if (electron && typeof electron.crashed_url === "string") {
    electron.crashed_url = withoutQuery(electron.crashed_url);
  }
  if (event.request?.url) event.request.url = withoutQuery(event.request.url);
  return event;
}

// Sentry is a third party: keep URL paths for context but drop query strings,
// and skip console output, which can include mail content.
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  if (breadcrumb.category === "console") return null;
  if (!breadcrumb.data) return breadcrumb;
  const data = { ...breadcrumb.data };
  for (const key of ["url", "from", "to"]) {
    if (typeof data[key] === "string") data[key] = withoutQuery(data[key]);
  }
  return { ...breadcrumb, data };
}

function withoutQuery(value: string) {
  try {
    const url = new URL(value);
    url.search = "";
    url.hash = "";
    return url.toString();
  } catch {
    return value.split(/[?#]/)[0] ?? value;
  }
}
