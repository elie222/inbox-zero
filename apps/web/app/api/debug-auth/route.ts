import { NextResponse } from "next/server";
import { auth } from "@/utils/auth";
import { betterAuthConfig } from "@/utils/auth";
import { cookies, headers } from "next/headers";

export async function GET() {
  try {
    const session = await auth();
    const cookieStore = await cookies();
    const headersList = await headers();

    // Test Better Auth session directly
    const directSession = await betterAuthConfig.api.getSession({
      headers: headersList,
    });

    // Get all cookies
    const allCookies = Array.from(cookieStore.getAll());

    // Get auth-related cookies
    const authCookies = allCookies.filter(
      (cookie) =>
        cookie.name.includes("auth") ||
        cookie.name.includes("session") ||
        cookie.name.includes("better-auth") ||
        cookie.name.includes("vercel"),
    );

    // Test if we can get user info
    let userInfo = null;
    if (session?.user?.id) {
      try {
        userInfo = await betterAuthConfig.api.getUser({
          headers: headersList,
        });
      } catch (error) {
        userInfo = {
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    }

    return NextResponse.json({
      // Session info
      hasSession: !!session,
      sessionUser: session?.user || null,
      directSession: directSession || null,
      userInfo,

      // Cookie info
      totalCookies: allCookies.length,
      authCookies: authCookies.map((c) => ({
        name: c.name,
        value: `${c.value.substring(0, 30)}...`,
        httpOnly: c.httpOnly,
        secure: c.secure,
        sameSite: c.sameSite,
        path: c.path,
        domain: c.domain,
      })),

      // Headers
      headers: {
        "user-agent": headersList.get("user-agent"),
        host: headersList.get("host"),
        referer: headersList.get("referer"),
        origin: headersList.get("origin"),
        "x-forwarded-for": headersList.get("x-forwarded-for"),
        "x-forwarded-proto": headersList.get("x-forwarded-proto"),
      },

      // Environment
      environment: {
        baseUrl: process.env.NEXT_PUBLIC_BASE_URL,
        nodeEnv: process.env.NODE_ENV,
        hasAuthSecret: !!process.env.AUTH_SECRET,
        hasGoogleClientId: !!process.env.GOOGLE_CLIENT_ID,
        hasGoogleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      },

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
