import { NextResponse } from "next/server";
import { auth } from "@/utils/auth";
import { cookies, headers } from "next/headers";

export async function GET() {
  try {
    const session = await auth();
    const cookieStore = await cookies();
    const headersList = await headers();

    // Get all auth-related cookies
    const authCookies = Array.from(cookieStore.getAll()).filter(
      (cookie) =>
        cookie.name.includes("auth") ||
        cookie.name.includes("session") ||
        cookie.name.includes("better-auth"),
    );

    // Get relevant headers
    const relevantHeaders = {
      "user-agent": headersList.get("user-agent"),
      host: headersList.get("host"),
      referer: headersList.get("referer"),
      cookie: headersList.get("cookie"),
    };

    return NextResponse.json({
      hasSession: !!session,
      user: session?.user || null,
      session: session || null,
      cookies: authCookies.map((c) => ({
        name: c.name,
        value: `${c.value.substring(0, 20)}...`,
      })),
      headers: relevantHeaders,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      hasSession: false,
      timestamp: new Date().toISOString(),
    });
  }
}
