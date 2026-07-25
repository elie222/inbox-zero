import { NextResponse } from "next/server";
import { env } from "@/env";
import { withAuth } from "@/utils/middleware";
import { fetchLogo, normalizeLogoDomain } from "@/utils/logo/fetch-logo";

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

  const logo = await fetchLogo({
    domain,
    logoDevToken: env.LOGO_DEV_TOKEN,
  });

  if (!logo) {
    return NextResponse.json(
      { error: "No logo found" },
      // Cache misses briefly (browser and CDN) so a flaky provider can
      // recover without the chain re-running on every avatar render
      {
        status: 404,
        headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600" },
      },
    );
  }

  return new NextResponse(logo.body, {
    headers: {
      "Content-Type": logo.contentType,
      "Cache-Control":
        "public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400",
      "X-Content-Type-Options": "nosniff",
    },
  });
});
