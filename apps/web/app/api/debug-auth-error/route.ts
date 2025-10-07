import { type NextRequest, NextResponse } from "next/server";
import { betterAuthConfig } from "@/utils/auth";

export async function GET(request: NextRequest) {
  try {
    // Get session
    const session = await betterAuthConfig.api.getSession({
      headers: request.headers,
    });

    // Get environment info
    const envInfo = {
      NODE_ENV: process.env.NODE_ENV,
      NEXT_PUBLIC_BASE_URL: process.env.NEXT_PUBLIC_BASE_URL,
      GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? "***SET***" : "NOT_SET",
      GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET
        ? "***SET***"
        : "NOT_SET",
      AUTH_SECRET: process.env.AUTH_SECRET ? "***SET***" : "NOT_SET",
    };

    return NextResponse.json({
      success: true,
      session: session
        ? {
            user: {
              id: session.user?.id,
              email: session.user?.email,
              name: session.user?.name,
            },
            session: {
              id: session.session?.id,
              expiresAt: session.session?.expiresAt,
            },
          }
        : null,
      env: envInfo,
      headers: Object.fromEntries(request.headers.entries()),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      },
      { status: 500 },
    );
  }
}
