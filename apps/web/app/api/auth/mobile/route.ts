import { NextResponse } from "next/server";
import { env } from "@/env";
import { withError, type RequestWithLogger } from "@/utils/middleware";
import { mobileAuthQuerySchema, MOBILE_REDIRECT_COOKIE } from "./validation";

/**
 * GET /api/auth/mobile
 *
 * Initiates mobile OAuth flow by:
 * 1. Validating the redirect_uri parameter
 * 2. Storing it in a secure cookie
 * 3. Redirecting to the login page where user can choose OAuth provider
 *
 * Query params:
 * - redirect_uri: The mobile app's deep link (e.g., inboxzero://auth-callback)
 *
 * Example:
 * GET /api/auth/mobile?redirect_uri=inboxzero://auth-callback
 */
export const GET = withError(
  "auth:mobile",
  async (request: RequestWithLogger) => {
    const { logger } = request;
    const searchParams = request.nextUrl.searchParams;
    const redirectUri = searchParams.get("redirect_uri");

    const result = mobileAuthQuerySchema.safeParse({
      redirect_uri: redirectUri,
    });

    if (!result.success) {
      const errorMessage = result.error.errors[0]?.message || "Invalid request";
      logger.warn("Mobile auth validation failed", {
        error: errorMessage,
        redirectUri,
      });
      return NextResponse.json({ error: errorMessage }, { status: 400 });
    }

    const { redirect_uri: validatedRedirectUri } = result.data;

    logger.info("Starting mobile OAuth flow");

    const callbackUrl = new URL(
      "/api/auth/mobile/complete",
      env.NEXT_PUBLIC_BASE_URL,
    );

    const loginUrl = new URL("/login", env.NEXT_PUBLIC_BASE_URL);
    loginUrl.searchParams.set("callbackUrl", callbackUrl.toString());

    const response = NextResponse.redirect(loginUrl);

    response.cookies.set(MOBILE_REDIRECT_COOKIE, validatedRedirectUri, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 10,
      path: "/",
    });

    return response;
  },
);
