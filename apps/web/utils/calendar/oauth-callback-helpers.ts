import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/utils/prisma";
import { CALENDAR_STATE_COOKIE_NAME } from "@/utils/calendar/constants";
import { parseOAuthState } from "@/utils/oauth/state";
import { prefixPath } from "@/utils/path";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";
import type {
  OAuthCallbackValidation,
  CalendarOAuthState,
} from "./oauth-types";

import { RedirectError } from "@/utils/oauth/redirect";

const calendarOAuthStateSchema = z.object({
  emailAccountId: z.string().min(1).max(64),
  type: z.literal("calendar"),
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
  const oauthError = searchParams.get("error");
  const errorDescription = searchParams.get("error_description");
  const errorSubcode = searchParams.get("error_subcode");
  const receivedState = searchParams.get("state");
  const storedState = request.cookies.get(CALENDAR_STATE_COOKIE_NAME)?.value;

  const baseRedirectUrl = new URL("/calendars", env.NEXT_PUBLIC_BASE_URL);
  const response = NextResponse.redirect(baseRedirectUrl);

  response.cookies.delete(CALENDAR_STATE_COOKIE_NAME);

  if (!storedState || !receivedState || storedState !== receivedState) {
    logger.warn("Invalid state during calendar callback", {
      receivedState,
      hasStoredState: !!storedState,
    });
    baseRedirectUrl.searchParams.set("error", "invalid_state");
    throw new RedirectError(baseRedirectUrl, response.headers);
  }

  const calendarState = parseAndValidateCalendarState(
    receivedState,
    logger,
    baseRedirectUrl,
    response.headers,
  );

  const redirectUrl = buildCalendarRedirectUrl(calendarState.emailAccountId);

  if (oauthError) {
    const aadstsCode = extractAadstsCode(errorDescription);
    const mappedError = mapCalendarOAuthError({
      oauthError,
      errorSubcode,
      aadstsCode,
    });

    logger.warn("OAuth error in calendar callback", {
      oauthError,
      errorSubcode,
      aadstsCode,
    });

    redirectUrl.searchParams.set("error", mappedError);
    const safeErrorDescription = getSafeOAuthErrorDescription(errorDescription);
    if (safeErrorDescription) {
      redirectUrl.searchParams.set("error_description", safeErrorDescription);
    }
    throw new RedirectError(redirectUrl, response.headers);
  }

  if (!code || code.length < 10) {
    logger.warn("Missing or invalid code in calendar callback");
    redirectUrl.searchParams.set("error", "missing_code");
    throw new RedirectError(redirectUrl, response.headers);
  }

  return { code, redirectUrl, response, calendarState };
}

/**
 * Parse and validate the OAuth state
 */
export function parseAndValidateCalendarState(
  storedState: string,
  logger: Logger,
  redirectUrl: URL,
  responseHeaders: Headers,
): CalendarOAuthState {
  let rawState: unknown;
  try {
    rawState = parseOAuthState<Omit<CalendarOAuthState, "nonce">>(storedState);
  } catch (error) {
    logger.error("Failed to decode state", { error });
    redirectUrl.searchParams.set("error", "invalid_state_format");
    throw new RedirectError(redirectUrl, responseHeaders);
  }

  const validationResult = calendarOAuthStateSchema.safeParse(rawState);
  if (!validationResult.success) {
    logger.error("State validation failed", {
      errors: validationResult.error.errors,
    });
    redirectUrl.searchParams.set("error", "invalid_state_format");
    throw new RedirectError(redirectUrl, responseHeaders);
  }

  return validationResult.data;
}

/**
 * Build redirect URL with emailAccountId
 */
export function buildCalendarRedirectUrl(emailAccountId: string): URL {
  return new URL(
    prefixPath(emailAccountId, "/calendars"),
    env.NEXT_PUBLIC_BASE_URL,
  );
}

/**
 * Check if calendar connection already exists
 */
export async function checkExistingConnection(
  emailAccountId: string,
  provider: "google" | "microsoft",
  email: string,
) {
  return await prisma.calendarConnection.findFirst({
    where: {
      emailAccountId,
      provider,
      email,
    },
  });
}

/**
 * Create a calendar connection record
 */
export async function createCalendarConnection(params: {
  provider: "google" | "microsoft";
  email: string;
  emailAccountId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: Date | null;
}) {
  return await prisma.calendarConnection.create({
    data: {
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

export function extractAadstsCode(errorDescription: string | null): string | null {
  if (!errorDescription) return null;
  const match = errorDescription.match(/AADSTS\d+/);
  return match ? match[0] : null;
}

export function mapCalendarOAuthError(params: {
  oauthError: string;
  errorSubcode: string | null;
  aadstsCode: string | null;
}): string {
  if (params.aadstsCode === "AADSTS65004") {
    return "consent_declined";
  }

  if (params.aadstsCode === "AADSTS65001") {
    return "admin_consent_required";
  }

  if (params.oauthError === "access_denied" && params.errorSubcode === "cancel") {
    return "consent_declined";
  }

  if (params.oauthError === "access_denied") {
    return "access_denied";
  }

  return "oauth_error";
}

export function getSafeOAuthErrorDescription(
  errorDescription: string | null,
): string | null {
  const aadstsCode = extractAadstsCode(errorDescription);
  if (!aadstsCode) return null;
  return `Microsoft error ${aadstsCode}.`;
}
