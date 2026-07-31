import { type NextRequest, NextResponse } from "next/server";
import {
  authenticateCarddavRequest,
  unauthorizedResponse,
} from "@/utils/carddav/auth";
import { recordCarddavExchange } from "@/utils/carddav/exchange-log";
import { handleCarddavRequest } from "@/utils/carddav/handler";
import { createScopedLogger } from "@/utils/logger";

// CardDAV clients (iOS/macOS Contacts) speak WebDAV verbs (PROPFIND/REPORT)
// that Next.js App Router route handlers can't receive. This proxy — pinned
// to the Node.js runtime — answers those verbs itself. Standard verbs
// (GET/PUT/DELETE/OPTIONS) still fall through to the route, which receives
// them natively.
//
// It also owns trailing-slash handling for the whole app: Apple's client
// canonicalizes DAV collection URLs with a trailing slash, and Next's
// built-in normalization answered those with a 308 BEFORE this proxy ran —
// and Apple drops the Authorization header when following redirects, turning
// every sync request into a redirect + re-auth dance. With
// skipTrailingSlashRedirect on (next.config.ts), CardDAV paths are served
// directly in either slash form, and every other path keeps the redirect
// Next used to inject.
export const config = {
  // CardDAV paths, plus ONLY trailing-slash URLs elsewhere — the redirect is
  // the single thing this proxy does for the rest of the app, so slashless
  // requests (virtually all real traffic: pages, webhooks, telemetry, static
  // files) never pay a function invocation for it
  matcher: [
    "/.well-known/carddav",
    "/api/carddav",
    "/api/carddav/:path*",
    "/((?!_next/static|_next/image|favicon\\.ico).*)/",
  ],
};

const WEBDAV_METHODS = new Set(["PROPFIND", "REPORT"]);

const logger = createScopedLogger("carddav-proxy");

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname === "/.well-known/carddav") {
    return NextResponse.redirect(new URL("/api/carddav", request.url), 301);
  }

  const isCarddav =
    pathname === "/api/carddav" || pathname.startsWith("/api/carddav/");

  // Slash-stripped targets are built from a plain URL, never from
  // request.nextUrl: NextURL records "had a trailing slash" at construction
  // and re-appends it on serialization, which turns a strip-the-slash
  // redirect into a redirect to itself
  const slashlessUrl = () => {
    const url = new URL(request.url);
    url.pathname = pathname.replace(/\/+$/, "");
    return url;
  };

  if (!isCarddav) {
    // The trailing-slash strip Next applied globally before
    // skipTrailingSlashRedirect turned it off
    if (pathname.length > 1 && pathname.endsWith("/")) {
      return NextResponse.redirect(slashlessUrl(), 308);
    }
    return NextResponse.next();
  }

  const method = request.method.toUpperCase();
  if (!WEBDAV_METHODS.has(method)) {
    // The route handler answers these; serve /api/carddav/addressbook/ and
    // /api/carddav/addressbook as the same resource
    if (pathname.endsWith("/")) {
      return NextResponse.rewrite(slashlessUrl());
    }
    return NextResponse.next();
  }

  const auth = await authenticateCarddavRequest(
    request.headers.get("authorization"),
  );
  if (!auth.ok) {
    // The unauthenticated first leg of the Basic handshake is normal; the
    // rest name a device holding a stale password or a malformed request
    if (auth.reason !== "no-credentials") {
      logger.warn("CardDAV auth rejected", { reason: auth.reason, method });
    }
    return unauthorizedResponse();
  }

  // Path after "/api/carddav": "principal", "addressbook", "addressbook/x.vcf"
  const segments = pathname.split("/").filter(Boolean).slice(2);
  const body = await request.text();
  const result = await handleCarddavRequest({
    method,
    segments,
    depth: request.headers.get("depth") ?? "0",
    body,
    emailAccountId: auth.emailAccountId,
    requestPath: pathname,
  });

  // One line per exchange, so a client that verifies, stalls, or gives up
  // paints its whole conversation. Client-chosen strings stay at trace.
  logger.info("CardDAV exchange", {
    method,
    path: segments.join("/") || "(root)",
    depth: request.headers.get("depth") ?? null,
    status: result.status,
    responseBytes: result.body?.length ?? 0,
    userAgent: request.headers.get("user-agent"),
    ...(result.meta ?? {}),
  });
  logger.trace("CardDAV request body", { requestBody: body });

  // The same line, journaled where the sync settings panel can show it —
  // awaited so serverless teardown can't drop it
  await recordCarddavExchange({
    emailAccountId: auth.emailAccountId,
    method,
    path: segments.join("/") || "(root)",
    depth: request.headers.get("depth"),
    status: result.status,
    responseBytes: result.body?.length ?? 0,
    userAgent: request.headers.get("user-agent"),
    detail: result.meta,
  });

  return new NextResponse(result.body ?? null, {
    status: result.status,
    headers: result.headers,
  });
}
