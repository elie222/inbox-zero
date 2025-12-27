import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/utils/prisma";
import { DRIVE_STATE_COOKIE_NAME } from "@/utils/drive/constants";
import { parseOAuthState } from "@/utils/oauth/state";
import { prefixPath } from "@/utils/path";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";
import { RedirectError } from "@/utils/oauth/redirect";

// ============================================================================
// Types
// ============================================================================

export interface DriveOAuthState {
  emailAccountId: string;
  type: "drive";
  nonce: string;
}

export interface OAuthCallbackValidation {
  code: string;
  redirectUrl: URL;
  response: NextResponse;
}

// ============================================================================
// State Validation
// ============================================================================

const driveOAuthStateSchema = z.object({
  emailAccountId: z.string().min(1).max(64),
  type: z.literal("drive"),
  nonce: z.string().min(8).max(128),
});

/**
 * Validate OAuth callback parameters and setup redirect
 */
export async function validateOAuthCallback(
  request: NextRequest,
  logger: Logger,
): Promise<OAuthCallbackValidation> {
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

/**
 * Parse and validate the OAuth state
 */
export function parseAndValidateDriveState(
  storedState: string,
  logger: Logger,
  redirectUrl: URL,
  responseHeaders: Headers,
): DriveOAuthState {
  let rawState: unknown;
  try {
    rawState = parseOAuthState<Omit<DriveOAuthState, "nonce">>(storedState);
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

// ============================================================================
// Redirect URL Building
// ============================================================================

/**
 * Build redirect URL with emailAccountId
 */
export function buildDriveRedirectUrl(emailAccountId: string): URL {
  return new URL(
    prefixPath(emailAccountId, "/drive"),
    env.NEXT_PUBLIC_BASE_URL,
  );
}

// ============================================================================
// Database Operations
// ============================================================================

/**
 * Check if drive connection already exists for this provider
 */
export async function checkExistingConnection(
  emailAccountId: string,
  provider: "google" | "microsoft",
) {
  return await prisma.driveConnection.findFirst({
    where: {
      emailAccountId,
      provider,
    },
  });
}

/**
 * Create or update a drive connection record
 */
export async function upsertDriveConnection(params: {
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
