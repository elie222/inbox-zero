import type { NextRequest, NextResponse } from "next/server";
import type { Logger } from "@/utils/logger";
import type { CalendarOAuthProvider } from "./oauth-types";
import {
  validateOAuthCallback,
  parseAndValidateCalendarState,
  buildCalendarRedirectUrl,
  verifyEmailAccountAccess,
  checkExistingConnection,
  createCalendarConnection,
  redirectWithMessage,
  redirectWithError,
  RedirectError,
} from "./oauth-callback-helpers";

/**
 * Unified handler for calendar OAuth callbacks
 */
export async function handleCalendarCallback(
  request: NextRequest,
  provider: CalendarOAuthProvider,
  logger: Logger,
): Promise<NextResponse> {
  try {
    // Step 1: Validate OAuth callback parameters
    const { code, redirectUrl, response } = await validateOAuthCallback(
      request,
      logger,
    );

    const storedState = request.cookies.get("calendar_state")?.value;
    if (!storedState) {
      throw new Error("Missing stored state");
    }

    // Step 2: Parse and validate the OAuth state
    const decodedState = parseAndValidateCalendarState(
      storedState,
      logger,
      redirectUrl,
      response.headers,
    );

    const { emailAccountId } = decodedState;

    // Step 3: Update redirect URL to include emailAccountId
    const finalRedirectUrl = buildCalendarRedirectUrl(
      emailAccountId,
      request.nextUrl.origin,
    );

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
      return redirectWithMessage(
        finalRedirectUrl,
        "calendar_already_connected",
        response.headers,
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
    );

    logger.info("Calendar connected successfully", {
      emailAccountId,
      email,
      provider: provider.name,
      connectionId: connection.id,
    });

    return redirectWithMessage(
      finalRedirectUrl,
      "calendar_connected",
      response.headers,
    );
  } catch (error) {
    // Handle redirect errors
    if (error instanceof RedirectError) {
      return redirectWithError(
        error.redirectUrl,
        "connection_failed",
        error.responseHeaders,
      );
    }

    // Handle all other errors
    logger.error("Error in calendar callback", { error });

    // Try to build a redirect URL, fallback to /calendars
    const errorRedirectUrl = new URL("/calendars", request.nextUrl.origin);
    return redirectWithError(
      errorRedirectUrl,
      "connection_failed",
      new Headers(),
    );
  }
}
