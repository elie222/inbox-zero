import { type NextRequest, NextResponse } from "next/server";

// CardDAV clients (iOS/macOS Contacts) speak WebDAV verbs that Next.js
// route handlers can't receive. This middleware — scoped strictly to
// CardDAV paths — tunnels PROPFIND/REPORT to the route as POST with the
// real verb in x-webdav-method, and serves the .well-known redirect.
export const config = {
  matcher: ["/.well-known/carddav", "/api/carddav/:path*", "/api/carddav"],
};

const TUNNELED_METHODS = new Set(["PROPFIND", "REPORT"]);

// The tunnel's self-request must target our own origin, never a host taken
// from the incoming request — a spoofed Host header would otherwise redirect
// this server-side fetch at an internal address (SSRF). NEXT_PUBLIC_BASE_URL
// is a required, build-inlined env, so it's always present here.
const SELF_ORIGIN = process.env.NEXT_PUBLIC_BASE_URL;

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname === "/.well-known/carddav") {
    return NextResponse.redirect(new URL("/api/carddav", request.url), 301);
  }

  if (!TUNNELED_METHODS.has(request.method)) {
    return NextResponse.next();
  }

  if (!SELF_ORIGIN) {
    return new NextResponse("CardDAV is not configured", { status: 500 });
  }

  const target = new URL(
    request.nextUrl.pathname + request.nextUrl.search,
    SELF_ORIGIN,
  );

  const headers = new Headers();
  headers.set("x-webdav-method", request.method);
  for (const name of ["authorization", "content-type", "depth"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  const response = await fetch(target, {
    method: "POST",
    headers,
    body: await request.text(),
  });

  return new NextResponse(response.body, {
    status: response.status,
    headers: response.headers,
  });
}
