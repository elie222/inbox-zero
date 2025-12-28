import { z } from "zod";
import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";
import type { DriveTokens } from "./types";
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
import prisma from "@/utils/prisma";
import { parseOAuthState } from "@/utils/oauth/state";
import { prefixPath } from "@/utils/path";

const driveOAuthStateSchema = z.object({
  emailAccountId: z.string().min(1).max(64),
  type: z.literal("drive"),
  nonce: z.string().min(8).max(128),
});

/**
 * Unified handler for drive OAuth callbacks
 */
export async function handleDriveCallback(
  request: NextRequest,
  provider: {
    name: "google" | "microsoft";
    exchangeCodeForTokens(code: string): Promise<DriveTokens>;
  },
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

/**
 * Validate OAuth callback parameters and setup redirect
 */
async function validateOAuthCallback(
  request: NextRequest,
  logger: Logger,
): Promise<{
  code: string;
  redirectUrl: URL;
  response: NextResponse;
}> {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const receivedState = searchParams.get("state");
  const storedState = request.cookies.get(DRIVE_STATE_COOKIE_NAME)?.value;

  const redirectUrl = new URL("/drive", env.NEXT_PUBLIC_BASE_URL);
  const response = NextResponse.redirect(redirectUrl);

  response.cookies.delete(DRIVE_STATE_COOKIE_NAME);

  if (!code || code.length < 10) {
    logger.warn("Missing or invalid code in drive callback");
    redirectUrl.searchParams.set("error", "missing_code");
    throw new RedirectError(redirectUrl, response.headers);
  }

  if (!storedState || !receivedState || storedState !== receivedState) {
    logger.warn("Invalid state during drive callback", {
      receivedState,
      hasStoredState: !!storedState,
    });
    redirectUrl.searchParams.set("error", "invalid_state");
    throw new RedirectError(redirectUrl, response.headers);
  }

  return { code, redirectUrl, response };
}

function parseAndValidateDriveState(
  storedState: string,
  logger: Logger,
  redirectUrl: URL,
  responseHeaders: Headers,
): {
  emailAccountId: string;
  type: "drive";
  nonce: string;
} {
  let rawState: unknown;
  try {
    rawState = parseOAuthState<{
      emailAccountId: string;
      type: "drive";
    }>(storedState);
  } catch (error) {
    logger.error("Failed to decode state", { error });
    redirectUrl.searchParams.set("error", "invalid_state_format");
    throw new RedirectError(redirectUrl, responseHeaders);
  }

  const validationResult = driveOAuthStateSchema.safeParse(rawState);
  if (!validationResult.success) {
    logger.error("State validation failed", {
      errors: validationResult.error.errors,
    });
    redirectUrl.searchParams.set("error", "invalid_state_format");
    throw new RedirectError(redirectUrl, responseHeaders);
  }

  return validationResult.data;
}

function buildDriveRedirectUrl(emailAccountId: string): URL {
  return new URL(
    prefixPath(emailAccountId, "/drive"),
    env.NEXT_PUBLIC_BASE_URL,
  );
}

// ============================================================================
// Database Operations
// ============================================================================

async function upsertDriveConnection(params: {
  provider: "google" | "microsoft";
  email: string;
  emailAccountId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null;
}) {
  return await prisma.driveConnection.upsert({
    where: {
      emailAccountId_provider: {
        emailAccountId: params.emailAccountId,
        provider: params.provider,
      },
    },
    update: {
      email: params.email,
      accessToken: params.accessToken,
      refreshToken: params.refreshToken,
      expiresAt: params.expiresAt,
      isConnected: true,
    },
    create: {
      provider: params.provider,
      email: params.email,
      emailAccountId: params.emailAccountId,
      accessToken: params.accessToken,
      refreshToken: params.refreshToken,
      expiresAt: params.expiresAt,
      isConnected: true,
    },
  });
}
