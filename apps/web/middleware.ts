import { type NextRequest, NextResponse } from "next/server";
import {
  createMarketingAnonymousId,
  isValidMarketingAnonymousId,
  MARKETING_ANONYMOUS_ID_COOKIE,
  MARKETING_ANONYMOUS_ID_MAX_AGE,
  withCookieValue,
} from "@/utils/marketing/identity";

export function middleware(request: NextRequest) {
  if (!shouldSetMarketingIdentity(request)) {
    return NextResponse.next();
  }

  const currentId = request.cookies.get(MARKETING_ANONYMOUS_ID_COOKIE)?.value;
  if (isValidMarketingAnonymousId(currentId)) {
    return NextResponse.next();
  }

  const anonymousId = createMarketingAnonymousId();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(
    "cookie",
    withCookieValue(
      request.headers.get("cookie"),
      MARKETING_ANONYMOUS_ID_COOKIE,
      anonymousId,
    ),
  );

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  response.cookies.set(MARKETING_ANONYMOUS_ID_COOKIE, anonymousId, {
    httpOnly: true,
    maxAge: MARKETING_ANONYMOUS_ID_MAX_AGE,
    path: "/",
    sameSite: "lax",
    secure: request.nextUrl.protocol === "https:",
  });

  return response;
}

function shouldSetMarketingIdentity(request: NextRequest) {
  if (request.method !== "GET" && request.method !== "HEAD") return false;
  if (request.nextUrl.pathname.includes(".")) return false;
  return true;
}

export const config = {
  matcher: [
    "/",
    "/app",
    "/app-review/:path*",
    "/components/:path*",
    "/connect-mailbox",
    "/home",
    "/login/:path*",
    "/logout",
    "/old-landing",
    "/oss-friends",
    "/pricing",
    "/thank-you",
    "/welcome/:path*",
    "/welcome-redirect",
    "/welcome-upgrade",
  ],
};
