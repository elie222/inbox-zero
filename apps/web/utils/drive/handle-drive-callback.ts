import type { NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";
import type { DriveTokens } from "./types";
import {
  validateOAuthCallback,
  parseAndValidateDriveState,
  buildDriveRedirectUrl,
  upsertDriveConnection,
} from "./oauth-callback-helpers";
import {
  RedirectError,
  redirectWithMessage,
  redirectWithError,
} from "@/utils/oauth/redirect";
import { verifyEmailAccountAccess } from "@/utils/oauth/verify";
import {
  acquireOAuthCodeLock,
  getOAuthCodeResult,
  setOAuthCodeResult,
  clearOAuthCode,
} from "@/utils/redis/oauth-code";
import { DRIVE_STATE_COOKIE_NAME } from "./constants";

export interface DriveOAuthProvider {
  name: "google" | "microsoft";
  exchangeCodeForTokens(code: string): Promise<DriveTokens>;
}

/**
 * Unified handler for drive OAuth callbacks
 */
export async function handleDriveCallback(
  request: NextRequest,
  provider: DriveOAuthProvider,
  logger: Logger,
): Promise<NextResponse> {
  let redirectHeaders = new Headers();

  try {
    // Step 1: Validate OAuth callback parameters
    const { code, redirectUrl, response } = await validateOAuthCallback(
      request,
      logger,
    );
    redirectHeaders = response.headers;

    // Step 1.5: Check for duplicate OAuth code processing
    const cachedResult = await getOAuthCodeResult(code);
    if (cachedResult) {
      logger.info("OAuth code already processed, returning cached result");
      const cachedRedirectUrl = new URL("/drive", env.NEXT_PUBLIC_BASE_URL);
      for (const [key, value] of Object.entries(cachedResult.params)) {
        cachedRedirectUrl.searchParams.set(key, value);
      }
      response.cookies.delete(DRIVE_STATE_COOKIE_NAME);
      return redirectWithMessage(
        cachedRedirectUrl,
        cachedResult.params.message || "drive_connected",
        redirectHeaders,
      );
    }

    const acquiredLock = await acquireOAuthCodeLock(code);
    if (!acquiredLock) {
      logger.info("OAuth code is being processed by another request");
      const lockRedirectUrl = new URL("/drive", env.NEXT_PUBLIC_BASE_URL);
      response.cookies.delete(DRIVE_STATE_COOKIE_NAME);
      return redirectWithMessage(
        lockRedirectUrl,
        "processing",
        redirectHeaders,
      );
    }

    // The validated state is in the request query params
    const receivedState = request.nextUrl.searchParams.get("state");
    if (!receivedState) {
      throw new Error("Missing validated state");
    }

    // Step 2: Parse and validate the OAuth state
    const decodedState = parseAndValidateDriveState(
      receivedState,
      logger,
      redirectUrl,
      response.headers,
    );

    const { emailAccountId } = decodedState;

    // Step 3: Update redirect URL to include emailAccountId
    const finalRedirectUrl = buildDriveRedirectUrl(emailAccountId);

    // Step 4: Verify user owns this email account
    await verifyEmailAccountAccess(
      emailAccountId,
      logger,
      finalRedirectUrl,
      response.headers,
    );

    // Step 5: Exchange code for tokens and get email
    const { accessToken, refreshToken, expiresAt, email } =
      await provider.exchangeCodeForTokens(code);

    // Step 6: Create or update drive connection
    const connection = await upsertDriveConnection({
      provider: provider.name,
      email,
      emailAccountId,
      accessToken,
      refreshToken,
      expiresAt,
    });

    logger.info("Drive connected successfully", {
      emailAccountId,
      email,
      provider: provider.name,
      connectionId: connection.id,
    });

    // Cache the successful result (best-effort, don't fail if cache write fails)
    try {
      await setOAuthCodeResult(code, { message: "drive_connected" });
    } catch (cacheError) {
      logger.warn("Failed to cache OAuth code result; continuing", {
        error: cacheError,
      });
    }

    return redirectWithMessage(
      finalRedirectUrl,
      "drive_connected",
      redirectHeaders,
    );
  } catch (error) {
    // Clear the OAuth code lock on error (best-effort, don't mask original error)
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    if (code) {
      await clearOAuthCode(code).catch((clearError) => {
        logger.warn("Failed to clear OAuth code on error; continuing", {
          error: clearError,
        });
      });
    }

    // Handle redirect errors
    if (error instanceof RedirectError) {
      return redirectWithError(
        error.redirectUrl,
        "connection_failed",
        error.responseHeaders,
      );
    }

    // Handle all other errors
    logger.error("Error in drive callback", { error });

    // Try to build a redirect URL, fallback to /drive
    const errorRedirectUrl = new URL("/drive", env.NEXT_PUBLIC_BASE_URL);
    return redirectWithError(
      errorRedirectUrl,
      "connection_failed",
      redirectHeaders,
    );
  }
}
