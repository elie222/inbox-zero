import { NextResponse } from "next/server";
import { env } from "@/env";
import { withAuth } from "@/utils/middleware";
import prisma from "@/utils/prisma";
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

// Logos change rarely; a stale one is cosmetic
const HIT_TTL_MS = 30 * 24 * 60 * 60 * 1000;
// Misses retry sooner so fixing a provider (e.g. the logo.dev token) shows
// up the same day
const MISS_TTL_MS = 6 * 60 * 60 * 1000;
// 128px logos run a few KB; anything above this is served but not stored
const MAX_CACHED_BYTES = 256 * 1024;

// Logo proxy: the browser never talks to the logo providers directly, and
// the provider chain runs behind SSRF guards because the domain comes from
// contact data (see utils/logo/fetch-logo.ts). Gated by withAuth so only a
// signed-in session (the only context that renders logos) can drive the
// outbound fetches — <img> sends the session cookie, no header needed.
//
// Resolved logos are cached in the database: Vercel's edge cache resets on
// every deployment, so without this the chain's outbound fetches re-ran per
// domain per viewer after each deploy and dominated function CPU time.
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

  const cacheKey = source ?? "auto";

  // Debug exists to show live provider behavior, so it skips the cache read
  if (!debug) {
    const cached = await prisma.cachedLogo.findUnique({
      where: { domain_source: { domain, source: cacheKey } },
    });
    if (cached) {
      const age = Date.now() - cached.checkedAt.getTime();
      const fresh = cached.body ? age < HIT_TTL_MS : age < MISS_TTL_MS;
      if (fresh) {
        if (!cached.body) return notFoundResponse();
        return logoResponse(
          cached.body,
          cached.contentType ?? "image/png",
          cached.provider ?? "cache",
        );
      }
    }
  }

  const attempts: LogoAttempt[] = [];
  const logo = await fetchLogo({
    domain,
    logoDevToken: env.LOGO_DEV_TOKEN,
    source,
    onAttempt: (attempt) => attempts.push(attempt),
  });
  const provider = providerHost(attempts);

  // Remember the outcome across deploys and viewers. An oversized logo is
  // served but not stored — a null body must only ever mean "no provider
  // had one", or the cache would 404 a domain that has a logo.
  if (!logo || logo.body.byteLength <= MAX_CACHED_BYTES) {
    const row = {
      checkedAt: new Date(),
      body: logo ? Buffer.from(logo.body) : null,
      contentType: logo?.contentType ?? null,
      provider,
    };
    await prisma.cachedLogo.upsert({
      where: { domain_source: { domain, source: cacheKey } },
      update: row,
      create: { domain, source: cacheKey, ...row },
    });
  }

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
          provider,
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
    return notFoundResponse();
  }

  return logoResponse(logo.body, logo.contentType, provider ?? "unknown");
});

function logoResponse(
  body: ArrayBuffer | Uint8Array,
  contentType: string,
  provider: string,
) {
  return new NextResponse(body as BodyInit, {
    headers: {
      "Content-Type": contentType,
      "Cache-Control":
        "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
      // Which provider served this logo — checkable from the network tab
      "X-Logo-Provider": provider,
    },
  });
}

// Cache misses briefly (browser and CDN) so a flaky provider can recover
// without the chain re-running on every avatar render
function notFoundResponse() {
  return NextResponse.json(
    { error: "No logo found" },
    {
      status: 404,
      headers: { "Cache-Control": "public, max-age=600, s-maxage=600" },
    },
  );
}

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
