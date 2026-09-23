import * as Sentry from "@sentry/electron/main";
import type { Breadcrumb } from "@sentry/electron/main";
import { app } from "electron";

// Injected at build time; development and self-hosted builds leave it empty.
const DSN = process.env.INBOX_ZERO_SENTRY_DSN;

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
  });
}

export function captureDesktopError(
  error: unknown,
  tags: Record<string, string>,
) {
  if (!DSN) return;
  Sentry.captureException(error, { tags });
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
