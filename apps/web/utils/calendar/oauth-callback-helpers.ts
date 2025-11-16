import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/utils/prisma";
import { CALENDAR_STATE_COOKIE_NAME } from "@/utils/calendar/constants";
import { parseOAuthState } from "@/utils/oauth/state";
import { auth } from "@/utils/auth";
import { prefixPath } from "@/utils/path";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";
import type {
  OAuthCallbackValidation,
  CalendarOAuthState,
} from "./oauth-types";

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
  const receivedState = searchParams.get("state");
  const storedState = request.cookies.get(CALENDAR_STATE_COOKIE_NAME)?.value;

  const expectedOrigin = new URL(env.NEXT_PUBLIC_BASE_URL).origin;
  if (request.nextUrl.origin !== expectedOrigin) {
    logger.error("Invalid origin in OAuth callback", {
      received: request.nextUrl.origin,
      expected: expectedOrigin,
    });
    throw new Error("Invalid redirect origin");
  }

  const redirectUrl = new URL("/calendars", env.NEXT_PUBLIC_BASE_URL);
  const response = NextResponse.redirect(redirectUrl);

  response.cookies.delete(CALENDAR_STATE_COOKIE_NAME);

  if (!code || code.length < 10) {
    logger.warn("Missing or invalid code in calendar callback");
    redirectUrl.searchParams.set("error", "missing_code");
    throw new RedirectError(redirectUrl, response.headers);
  }

  if (!storedState || !receivedState || storedState !== receivedState) {
    logger.warn("Invalid state during calendar callback", {
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
 * Verify user owns the email account
 */
export async function verifyEmailAccountAccess(
  emailAccountId: string,
  logger: Logger,
  redirectUrl: URL,
  responseHeaders: Headers,
): Promise<void> {
  const session = await auth();
  if (!session?.user?.id) {
    logger.warn("Unauthorized calendar callback - no session");
    redirectUrl.searchParams.set("error", "unauthorized");
    throw new RedirectError(redirectUrl, responseHeaders);
  }

  const emailAccount = await prisma.emailAccount.findFirst({
    where: {
      id: emailAccountId,
      userId: session.user.id,
    },
    select: { id: true },
  });

  if (!emailAccount) {
    logger.warn("Unauthorized calendar callback - invalid email account", {
      emailAccountId,
      userId: session.user.id,
    });
    redirectUrl.searchParams.set("error", "forbidden");
    throw new RedirectError(redirectUrl, responseHeaders);
  }
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

/**
 * Redirect with success message
 */
export function redirectWithMessage(
  redirectUrl: URL,
  message: string,
  responseHeaders: Headers,
): NextResponse {
  redirectUrl.searchParams.set("message", message);
  return NextResponse.redirect(redirectUrl, { headers: responseHeaders });
}

/**
 * Redirect with error message
 */
export function redirectWithError(
  redirectUrl: URL,
  error: string,
  responseHeaders: Headers,
): NextResponse {
  redirectUrl.searchParams.set("error", error);
  return NextResponse.redirect(redirectUrl, { headers: responseHeaders });
}

/**
 * Custom error class for redirect responses
 */
export class RedirectError extends Error {
  redirectUrl: URL;
  responseHeaders: Headers;

  constructor(redirectUrl: URL, responseHeaders: Headers) {
    super("Redirect required");
    this.name = "RedirectError";
    this.redirectUrl = redirectUrl;
    this.responseHeaders = responseHeaders;
  }
}
