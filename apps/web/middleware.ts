import { NextResponse, type NextRequest } from "next/server";
import { env } from "./env";

export function middleware(request: NextRequest) {
  const res = NextResponse.next();

  const allowedOrigin = env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "");
  const requestOrigin = request.headers.get("origin") || "";

  if (allowedOrigin && requestOrigin === allowedOrigin) {
    res.headers.set("Access-Control-Allow-Origin", allowedOrigin);
  }

  // Basic CORS/preflight support (matches next.config headers)
  res.headers.set(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );

  if (request.method === "OPTIONS") {
    res.headers.set(
      "Access-Control-Allow-Headers",
      request.headers.get("Access-Control-Request-Headers") || "*",
    );
    return new NextResponse(null, { status: 204, headers: res.headers });
  }

  return res;
}

export const config = {
  matcher: "/:path*",
};
