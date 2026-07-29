import { type NextRequest, NextResponse } from "next/server";
import {
  authenticateCarddavRequest,
  unauthorizedResponse,
} from "@/utils/carddav/auth";
import { handleCarddavRequest } from "@/utils/carddav/handler";
import { createScopedLogger } from "@/utils/logger";

// CardDAV clients (iOS/macOS Contacts) speak WebDAV verbs (PROPFIND/REPORT)
// that Next.js App Router route handlers can't receive. This proxy — scoped
// strictly to CardDAV paths and pinned to the Node.js runtime — answers those
// verbs itself. Standard verbs (GET/PUT/DELETE/OPTIONS) still fall through to
// the route, which receives them natively.
//
// It used to tunnel PROPFIND/REPORT by fetching its own public origin as a
// POST and relaying the result. That worked, but every WebDAV response then
// crossed Vercel's edge a second time — a second cold start, the inner
// response's whole header set (x-middleware-*, x-vercel-*, a possible
// Set-Cookie) replayed onto the client response, and re-entry through the
// edge firewall. Answering in place removes that hop.
export const config = {
  matcher: ["/.well-known/carddav", "/api/carddav/:path*", "/api/carddav"],
};

const WEBDAV_METHODS = new Set(["PROPFIND", "REPORT"]);

const logger = createScopedLogger("carddav-proxy");

export async function proxy(request: NextRequest) {
  if (request.nextUrl.pathname === "/.well-known/carddav") {
    return NextResponse.redirect(new URL("/api/carddav", request.url), 301);
  }

  const method = request.method.toUpperCase();
  // The route already handles the standard verbs it can receive
  if (!WEBDAV_METHODS.has(method)) {
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
  const segments = request.nextUrl.pathname.split("/").filter(Boolean).slice(2);
  const body = await request.text();
  const result = await handleCarddavRequest({
    method,
    segments,
    depth: request.headers.get("depth") ?? "0",
    body,
    emailAccountId: auth.emailAccountId,
    requestPath: request.nextUrl.pathname,
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
  });
  logger.trace("CardDAV request body", { requestBody: body });

  return new NextResponse(result.body ?? null, {
    status: result.status,
    headers: result.headers,
  });
}
