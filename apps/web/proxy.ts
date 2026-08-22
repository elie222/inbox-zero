import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import {
  appendVaryAccept,
  prefersMarkdown,
} from "@/utils/agent-markdown/accept";
import {
  getMarkdownForPath,
  getNotFoundMarkdown,
  markdownResponse,
} from "@/utils/agent-markdown/content";

/**
 * Top-level paths that belong to the authenticated product shell (or auth/API).
 * Markdown negotiation is only for public marketing/content URLs.
 */
const APP_PATH_PREFIXES = [
  "/api",
  "/admin",
  "/accounts",
  "/action-required",
  "/assistant",
  "/assistant-redirect",
  "/automation",
  "/bulk-unsubscribe",
  "/calendars",
  "/channels",
  "/clean",
  "/cold-email-blocker",
  "/compose",
  "/composio",
  "/debug",
  "/drive",
  "/early-access",
  "/integrations",
  "/license",
  "/mail",
  "/meetings",
  "/no-access",
  "/onboarding",
  "/organization",
  "/organizations",
  "/premium",
  "/refer",
  "/reply-zero",
  "/request-access",
  "/settings",
  "/setup",
  "/smart-categories",
  "/stats",
  "/unsubscribe",
  "/usage",
  "/writer",
] as const;

/** Sections under /[emailAccountId]/... */
const EMAIL_ACCOUNT_SECTIONS = new Set([
  "assistant",
  "automation",
  "briefs",
  "bulk-archive",
  "bulk-unsubscribe",
  "calendars",
  "channels",
  "clean",
  "cold-email-blocker",
  "compose",
  "debug",
  "drive",
  "integrations",
  "mail",
  "meetings",
  "no-reply",
  "onboarding",
  "onboarding-brief",
  "organization",
  "permissions",
  "quick-bulk-archive",
  "reply-zero",
  "settings",
  "setup",
  "smart-categories",
  "stats",
  "usage",
]);

function isAppPath(pathname: string): boolean {
  if (
    APP_PATH_PREFIXES.some(
      (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
  ) {
    return true;
  }

  const segments = pathname.split("/").filter(Boolean);
  // /:emailAccountId/<section>/... product routes
  if (segments.length >= 2 && EMAIL_ACCOUNT_SECTIONS.has(segments[1])) {
    return true;
  }

  return false;
}

function isNextInternalRequest(request: NextRequest): boolean {
  return (
    request.headers.has("rsc") ||
    request.headers.has("next-router-state-tree") ||
    request.headers.has("next-router-prefetch") ||
    request.headers.has("next-router-segment-prefetch")
  );
}

function withVaryAccept(response: NextResponse): NextResponse {
  appendVaryAccept(response.headers);
  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Always leave Next internals / static assets alone.
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/monitoring") ||
    pathname.startsWith("/ingest")
  ) {
    return NextResponse.next();
  }

  // RSC / prefetch must keep the HTML/RSC representation.
  if (isNextInternalRequest(request)) {
    return withVaryAccept(NextResponse.next());
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return withVaryAccept(NextResponse.next());
  }

  if (!prefersMarkdown(request.headers.get("accept"))) {
    // Public pages still advertise negotiation for caches.
    if (!isAppPath(pathname)) {
      return withVaryAccept(NextResponse.next());
    }
    return NextResponse.next();
  }

  if (isAppPath(pathname)) {
    return withVaryAccept(NextResponse.next());
  }

  const origin = request.nextUrl.origin;
  const pageMarkdown = getMarkdownForPath(pathname, origin);
  if (pageMarkdown) {
    return markdownResponse(pageMarkdown);
  }

  // Unknown public path + markdown Accept → agent-recoverable markdown 404.
  return markdownResponse(getNotFoundMarkdown(origin), { status: 404 });
}

export const config = {
  matcher: [
    /*
     * Match public site paths. Skip Next internals and common static files.
     * llms.txt is served by its route handler (has a file extension, so this
     * matcher skips it). Markdown Accept on unknown paths still 404s helpfully.
     */
    "/((?!_next/static|_next/image|favicon.ico|icons/|images/|splash_screens/|.*\\..*).*)",
  ],
};
