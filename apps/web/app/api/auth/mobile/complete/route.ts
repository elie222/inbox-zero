import { NextResponse } from "next/server";
import { env } from "@/env";
import { auth } from "@/utils/auth";
import prisma from "@/utils/prisma";
import { withError, type RequestWithLogger } from "@/utils/middleware";
import { generateSecureToken } from "@/utils/api-key";
import { MOBILE_REDIRECT_COOKIE, ALLOWED_SCHEMES } from "../validation";

const MOBILE_SESSION_DURATION_DAYS = 30;

/**
 * GET /api/auth/mobile/complete
 *
 * Completes the mobile OAuth flow by:
 * 1. Verifying the user is authenticated
 * 2. Reading the mobile redirect URI from cookie
 * 3. Creating a dedicated mobile session token
 * 4. Redirecting to the mobile app with the token
 *
 * The mobile app receives:
 * - Success: inboxzero://auth-callback?token=xxx&expires=xxx
 * - Error: inboxzero://auth-callback?error=xxx&error_description=xxx
 */
export const GET = withError(
  "auth:mobile:complete",
  async (request: RequestWithLogger) => {
    const { logger } = request;
    const mobileRedirectUri = request.cookies.get(
      MOBILE_REDIRECT_COOKIE,
    )?.value;

    if (!mobileRedirectUri) {
      logger.warn("Mobile redirect cookie not found, redirecting to home");
      return NextResponse.redirect(new URL("/", env.NEXT_PUBLIC_BASE_URL));
    }

    const isValidScheme = ALLOWED_SCHEMES.some((scheme) =>
      mobileRedirectUri.startsWith(scheme),
    );
    if (!isValidScheme) {
      logger.error("Invalid redirect URI scheme in cookie", {
        mobileRedirectUri,
      });
      return NextResponse.redirect(new URL("/", env.NEXT_PUBLIC_BASE_URL));
    }

    const session = await auth();

    if (!session?.user) {
      logger.warn("User not authenticated during mobile auth completion");
      return redirectWithError(mobileRedirectUri, {
        error: "authentication_failed",
        description: "User is not authenticated. Please try again.",
      });
    }

    const userId = session.user.id;
    const requestLogger = logger.with({ userId });

    try {
      const userAgent = request.headers.get("user-agent") || undefined;
      const forwardedFor = request.headers.get("x-forwarded-for");
      const ipAddress = forwardedFor?.split(",")[0]?.trim() || undefined;

      const sessionToken = generateSecureToken();
      const expires = new Date(
        Date.now() + MOBILE_SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000,
      );

      await prisma.session.create({
        data: {
          sessionToken,
          userId,
          expires,
          userAgent,
          ipAddress,
        },
      });

      requestLogger.info("Created mobile session", {
        expires: expires.toISOString(),
        hasUserAgent: !!userAgent,
        hasIpAddress: !!ipAddress,
      });

      const successUrl = new URL(mobileRedirectUri);
      successUrl.searchParams.set("token", sessionToken);
      successUrl.searchParams.set("expires", expires.toISOString());

      const response = NextResponse.redirect(successUrl);
      response.cookies.delete(MOBILE_REDIRECT_COOKIE);

      return response;
    } catch (error) {
      requestLogger.error("Failed to create mobile session", { error });

      return redirectWithError(mobileRedirectUri, {
        error: "server_error",
        description:
          "An error occurred during authentication. Please try again.",
      });
    }
  },
);

function redirectWithError(
  mobileRedirectUri: string,
  { error, description }: { error: string; description: string },
) {
  const errorUrl = new URL(mobileRedirectUri);
  errorUrl.searchParams.set("error", error);
  errorUrl.searchParams.set("error_description", description);

  const response = NextResponse.redirect(errorUrl);
  response.cookies.delete(MOBILE_REDIRECT_COOKIE);
  return response;
}
