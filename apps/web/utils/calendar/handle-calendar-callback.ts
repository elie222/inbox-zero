import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";
import type { CalendarOAuthProvider } from "./oauth-types";
import {
  validateOAuthCallback,
  buildCalendarRedirectUrl,
  checkExistingConnection,
  createCalendarConnection,
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
import {
  CALENDAR_STATE_COOKIE_NAME,
  CALENDAR_ONBOARDING_RETURN_COOKIE,
} from "./constants";
import { isInternalPath } from "@/utils/path";

/**
 * Unified handler for calendar OAuth callbacks
 */
export async function handleCalendarCallback(
  request: NextRequest,
  provider: CalendarOAuthProvider,
  logger: Logger,
): Promise<NextResponse> {
  let redirectHeaders = new Headers();

  try {
    // Step 1: Validate OAuth callback parameters
    const { code, response, calendarState } = await validateOAuthCallback(
      request,
      logger,
    );
    redirectHeaders = response.headers;

    // Clear the onboarding return cookie so it doesn't cause
    // unwanted redirects on future visits to the calendars page
    const onboardingReturnPath = request.cookies.get(
      CALENDAR_ONBOARDING_RETURN_COOKIE,
    )?.value;
    response.cookies.delete(CALENDAR_ONBOARDING_RETURN_COOKIE);

    // Step 1.5: Check for duplicate OAuth code processing
    const cachedResult = await getOAuthCodeResult(code);
    if (cachedResult) {
      logger.info("OAuth code already processed, returning cached result");
      const cachedRedirectUrl = new URL("/calendars", env.NEXT_PUBLIC_BASE_URL);
      for (const [key, value] of Object.entries(cachedResult.params)) {
        cachedRedirectUrl.searchParams.set(key, value);
      }
      response.cookies.delete(CALENDAR_STATE_COOKIE_NAME);
      return redirectWithMessage(
        cachedRedirectUrl,
        cachedResult.params.message || "calendar_connected",
        redirectHeaders,
      );
    }

    const acquiredLock = await acquireOAuthCodeLock(code);
    if (!acquiredLock) {
      logger.info("OAuth code is being processed by another request");
      const lockRedirectUrl = new URL("/calendars", env.NEXT_PUBLIC_BASE_URL);
      response.cookies.delete(CALENDAR_STATE_COOKIE_NAME);
      return redirectWithMessage(
        lockRedirectUrl,
        "processing",
        redirectHeaders,
      );
    }

    const { emailAccountId } = calendarState;

    // Step 3: Update redirect URL to include emailAccountId
    const finalRedirectUrl = buildCalendarRedirectUrl(emailAccountId);

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

    // Step 6: Check if connection already exists
    const existingConnection = await checkExistingConnection(
      emailAccountId,
      provider.name,
      email,
    );

    if (existingConnection) {
      logger.info("Calendar connection already exists", {
        emailAccountId,
        email,
        provider: provider.name,
      });
      // Cache the result for duplicate requests
      await setOAuthCodeResult(code, { message: "calendar_already_connected" });
      return redirectWithMessage(
        finalRedirectUrl,
        "calendar_already_connected",
        redirectHeaders,
      );
    }

    // Step 7: Create calendar connection
    const connection = await createCalendarConnection({
      provider: provider.name,
      email,
      emailAccountId,
      accessToken,
      refreshToken,
      expiresAt,
    });

    // Step 8: Sync calendars
    await provider.syncCalendars(
      connection.id,
      accessToken,
      refreshToken,
      emailAccountId,
      expiresAt,
    );

    logger.info("Calendar connected successfully", {
      emailAccountId,
      email,
      provider: provider.name,
      connectionId: connection.id,
    });

    // Cache the successful result
    await setOAuthCodeResult(code, { message: "calendar_connected" });

    // If there's an onboarding return path, redirect there instead of calendars
    const successRedirectUrl =
      getOnboardingReturnUrl(onboardingReturnPath) ?? finalRedirectUrl;

    return redirectWithMessage(
      successRedirectUrl,
      "calendar_connected",
      redirectHeaders,
    );
  } catch (error) {
    // Clear the OAuth code lock on error
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get("code");
    if (code) {
      await clearOAuthCode(code);
    }
    // Handle redirect errors
    if (error instanceof RedirectError) {
      if (error.redirectUrl.searchParams.get("error")) {
        return NextResponse.redirect(error.redirectUrl, {
          headers: error.responseHeaders,
        });
      }

      return redirectWithError(
        error.redirectUrl,
        "connection_failed",
        error.responseHeaders,
      );
    }

    // Handle all other errors
    logger.error("Error in calendar callback", { error });

    // Try to build a redirect URL, fallback to /calendars
    const errorRedirectUrl = new URL("/calendars", env.NEXT_PUBLIC_BASE_URL);
    return redirectWithError(
      errorRedirectUrl,
      "connection_failed",
      redirectHeaders,
    );
  }
}

function getOnboardingReturnUrl(cookieValue: string | undefined): URL | null {
  if (!cookieValue) return null;
  try {
    const returnPath = decodeURIComponent(cookieValue);
    if (!isInternalPath(returnPath)) return null;
    return new URL(returnPath, env.NEXT_PUBLIC_BASE_URL);
  } catch {
    return null;
  }
}
