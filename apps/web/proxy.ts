import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import {
  appendVaryAccept,
  prefersMarkdown,
} from "@/utils/agent-markdown/accept";
import {
  getMarkdownForPath,
  markdownResponse,
} from "@/utils/agent-markdown/content";
import { BRAND_NAME, SUPPORT_EMAIL } from "@/utils/branding";
import { auth } from "@/utils/auth";

export async function proxy(request: NextRequest) {
  if (isNextInternalRequest(request)) {
    return withVaryAccept(NextResponse.next());
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return withVaryAccept(NextResponse.next());
  }

  if (!prefersMarkdown(request.headers.get("accept"))) {
    if (request.nextUrl.pathname === "/") {
      const hasSessionCookie = request.cookies.has(
        "__Secure-better-auth.session_token",
      );
      const hasLegacySessionCookie = request.cookies.has(
        "__Secure-better-auth.session-token.1",
      );

      if (hasSessionCookie || hasLegacySessionCookie) {
        const session = await auth(request.headers);
        if (session?.user) {
          const destination = request.nextUrl.clone();
          destination.pathname = hasSessionCookie ? "/automation" : "/setup";
          const response = NextResponse.redirect(destination);
          response.headers.set("Cache-Control", "private, no-store");
          return withVaryAccept(response);
        }
      }
    }

    return withVaryAccept(NextResponse.next());
  }

  const pageMarkdown = getMarkdownForPath(
    request.nextUrl.pathname,
    request.nextUrl.origin,
    { brandName: BRAND_NAME, supportEmail: SUPPORT_EMAIL },
  );
  if (pageMarkdown) {
    return markdownResponse(pageMarkdown);
  }

  return withVaryAccept(NextResponse.next());
}

export const config = {
  matcher: ["/", "/pricing"],
};

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
