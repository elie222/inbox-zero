import type { NextRequest } from "next/server";
import { withError } from "@/utils/middleware";
import {
  authenticateCarddavRequest,
  unauthorizedResponse,
} from "@/utils/carddav/auth";
import { handleCarddavRequest } from "@/utils/carddav/handler";

export const maxDuration = 60;

// CardDAV endpoint for iOS/macOS Contacts. The WebDAV verbs (PROPFIND/REPORT)
// are answered by proxy.ts before they reach here, because App Router route
// handlers can't receive them. This handles the standard verbs a client sends
// once it's past discovery: OPTIONS capability probes, GET/PUT/DELETE of an
// individual contact's vCard.
const handle = withError("carddav", async (request) => {
  const method = request.method.toUpperCase();

  // OPTIONS responds before auth: iOS probes capabilities first
  if (method === "OPTIONS") {
    return toResponse(
      await handleCarddavRequest({
        method,
        segments: [],
        depth: "0",
        body: "",
        emailAccountId: "",
      }),
    );
  }

  const auth = await authenticateCarddavRequest(
    request.headers.get("authorization"),
  );
  if (!auth.ok) {
    if (auth.reason !== "no-credentials") {
      request.logger.warn("CardDAV auth rejected", {
        reason: auth.reason,
        method,
      });
    }
    return unauthorizedResponse();
  }

  // Catch-all params type as string[] which withError's context doesn't
  // model — the path itself is the source of truth anyway
  const segments = request.nextUrl.pathname.split("/").filter(Boolean).slice(2); // drop "api", "carddav"
  const requestBody = await request.text();

  const result = await handleCarddavRequest({
    method,
    segments,
    depth: request.headers.get("depth") ?? "0",
    body: requestBody,
    emailAccountId: auth.emailAccountId,
    requestPath: request.nextUrl.pathname,
  });

  request.logger.info("CardDAV exchange", {
    method,
    path: segments.join("/") || "(root)",
    status: result.status,
    responseBytes: result.body?.length ?? 0,
    userAgent: request.headers.get("user-agent"),
  });
  request.logger.trace("CardDAV request body", { requestBody });

  return toResponse(result);
});

const routeHandler = (request: NextRequest) =>
  handle(request, { params: Promise.resolve({}) });

export const GET = routeHandler;
export const PUT = routeHandler;
export const DELETE = routeHandler;
export const OPTIONS = routeHandler;

function toResponse(result: {
  status: number;
  headers?: Record<string, string>;
  body?: string;
}): Response {
  return new Response(result.body ?? null, {
    status: result.status,
    headers: result.headers,
  });
}
