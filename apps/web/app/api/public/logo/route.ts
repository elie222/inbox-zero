import { NextResponse } from "next/server";
import { env } from "@/env";
import { withAuth } from "@/utils/middleware";
import {
  fetchLogo,
  LOGO_SOURCES,
  type LogoAttempt,
  type LogoSource,
  normalizeLogoDomain,
} from "@/utils/logo/fetch-logo";

export const runtime = "nodejs";
// Comfortably above the 12s provider budget in fetch-logo.ts — the chain
// must finish on its own; a platform timeout surfaces as a 5xx
export const maxDuration = 30;

// Logo proxy: the browser never talks to the logo providers directly, and
// the provider chain runs behind SSRF guards because the domain comes from
// contact data (see utils/logo/fetch-logo.ts). Gated by withAuth so only a
// signed-in session (the only context that renders logos) can drive the
// outbound fetches — <img> sends the session cookie, no header needed.
export const GET = withAuth("logo", async (request) => {
  const raw = request.nextUrl.searchParams.get("domain") ?? "";
  const domain = normalizeLogoDomain(raw);
  if (!domain) {
    return NextResponse.json({ error: "Invalid domain" }, { status: 400 });
  }

  const debug = request.nextUrl.searchParams.get("debug") === "1";

  // Restrict to one provider family (the logo picker offers per-source
  // images); an unknown value 400s rather than silently running the chain
  const rawSource = request.nextUrl.searchParams.get("source");
  const source = (LOGO_SOURCES as readonly string[]).includes(rawSource ?? "")
    ? (rawSource as LogoSource)
    : undefined;
  if (rawSource && !source) {
    return NextResponse.json({ error: "Invalid source" }, { status: 400 });
  }

  const attempts: LogoAttempt[] = [];
  const logo = await fetchLogo({
    domain,
    logoDevToken: env.LOGO_DEV_TOKEN,
    source,
    onAttempt: (attempt) => attempts.push(attempt),
  });

  // Answers "why is there no logo for X?" without log access: shows whether
  // logo.dev is configured and what every provider returned. Signed-in only
  // (whole route is behind withAuth); tokens never appear in attempt URLs.
  if (debug) {
    return NextResponse.json(
      {
        domain,
        ...(source && { source }),
        logoDevConfigured: Boolean(env.LOGO_DEV_TOKEN),
        found: !!logo,
        ...(logo && {
          contentType: logo.contentType,
          bytes: logo.body.byteLength,
          provider: providerHost(attempts),
        }),
        attempts: attempts.map(redactAttempt),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!logo) {
    request.logger.info("No logo found", {
      domain,
      logoDevConfigured: Boolean(env.LOGO_DEV_TOKEN),
      attempts: attempts.map(redactAttempt),
    });
    return NextResponse.json(
      { error: "No logo found" },
      // Cache misses briefly (browser and CDN) so a flaky provider can
      // recover without the chain re-running on every avatar render — but
      // short enough that fixing a provider (e.g. the logo.dev token) shows
      // up in minutes, not an hour
      {
        status: 404,
        headers: { "Cache-Control": "public, max-age=600, s-maxage=600" },
      },
    );
  }

  return new NextResponse(logo.body, {
    headers: {
      "Content-Type": logo.contentType,
      "Cache-Control":
        "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
      // Which provider served this logo — checkable from the network tab
      "X-Logo-Provider": providerHost(attempts) ?? "unknown",
    },
  });
});

// The winning attempt's host, e.g. "img.logo.dev" or "icons.duckduckgo.com"
function providerHost(attempts: LogoAttempt[]): string | null {
  const hit = attempts.find((attempt) => attempt.outcome === "hit");
  return hit ? new URL(hit.url).hostname : null;
}

// The logo.dev URL carries the token as a query param — strip query strings
// before attempts leave the server (debug JSON, logs)
function redactAttempt(attempt: LogoAttempt): LogoAttempt {
  const url = new URL(attempt.url);
  return { ...attempt, url: `${url.origin}${url.pathname}` };
}
