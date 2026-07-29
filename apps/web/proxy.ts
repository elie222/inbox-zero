import { type NextRequest, NextResponse } from "next/server";

// CardDAV clients (iOS/macOS Contacts) speak WebDAV verbs that Next.js
// route handlers can't receive. This proxy — scoped strictly to CardDAV
// paths — tunnels PROPFIND/REPORT to the route as POST with the real verb
// in x-webdav-method, and serves the .well-known redirect.
export const config = {
  matcher: ["/.well-known/carddav", "/api/carddav/:path*", "/api/carddav"],
};

const TUNNELED_METHODS = new Set(["PROPFIND", "REPORT"]);

// The tunnel's self-request must target our own origin, never a host taken
// from the incoming request — a spoofed Host header would otherwise redirect
// this server-side fetch at an internal address (SSRF). NEXT_PUBLIC_BASE_URL
// is a required, build-inlined env, so it's always present here.
const SELF_ORIGIN = process.env.NEXT_PUBLIC_BASE_URL;

export async function proxy(request: NextRequest) {
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

  // Buffer rather than pass the stream through: a streamed body through the
  // proxy is the one leg of this exchange nothing else exercises, and a 207
  // whose XML never arrives looks identical to success in the logs. Buffering
  // also gives the response a correct content-length. Bodies here are one
  // address book at most, so memory isn't a concern.
  const body = await response.text();

  return new NextResponse(body, {
    status: response.status,
    headers: forwardableResponseHeaders(response.headers),
  });
}

// fetch transparently decompresses the body, so forwarding the inner
// response's content-encoding/content-length verbatim describes bytes the
// client never receives — the client then fails to parse the multistatus XML
// and iOS reports "account verification failed". Connection-level headers
// belong to the hop we just terminated, so they go too.
const NON_FORWARDABLE_HEADERS = new Set([
  "content-encoding",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
]);

function forwardableResponseHeaders(headers: Headers) {
  const forwarded = new Headers();
  headers.forEach((value, name) => {
    if (!NON_FORWARDABLE_HEADERS.has(name.toLowerCase())) {
      forwarded.set(name, value);
    }
  });
  return forwarded;
}
