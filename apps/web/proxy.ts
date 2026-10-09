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

export function proxy(request: NextRequest) {
  if (isNextInternalRequest(request)) {
    return withVaryAccept(NextResponse.next());
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    return withVaryAccept(NextResponse.next());
  }

  if (!prefersMarkdown(request.headers.get("accept"))) {
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
