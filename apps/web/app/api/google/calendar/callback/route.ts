import { NextResponse } from "next/server";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import {
  getCalendarOAuth2Client,
  fetchGoogleCalendars,
  getCalendarClientWithRefresh,
} from "@/utils/calendar/client";
import { withError } from "@/utils/middleware";
import { CALENDAR_STATE_COOKIE_NAME } from "@/utils/calendar/constants";
import { parseOAuthState } from "@/utils/oauth/state";
import { auth } from "@/utils/auth";
import { prefixPath } from "@/utils/path";

const logger = createScopedLogger("google/calendar/callback");

export const GET = withError(async (request) => {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const receivedState = searchParams.get("state");
  const storedState = request.cookies.get(CALENDAR_STATE_COOKIE_NAME)?.value;

  // We'll set the proper redirect URL after we decode the state and get emailAccountId
  let redirectUrl = new URL("/calendars", request.nextUrl.origin);
  const response = NextResponse.redirect(redirectUrl);

  response.cookies.delete(CALENDAR_STATE_COOKIE_NAME);

  if (!code) {
    logger.warn("Missing code in Google Calendar callback");
    redirectUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  if (!storedState || !receivedState || storedState !== receivedState) {
    logger.warn("Invalid state during Google Calendar callback", {
      receivedState,
      hasStoredState: !!storedState,
    });
    redirectUrl.searchParams.set("error", "invalid_state");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  let decodedState: { emailAccountId: string; type: string; nonce: string };
  try {
    decodedState = parseOAuthState(storedState);
  } catch (error) {
    logger.error("Failed to decode state", { error });
    redirectUrl.searchParams.set("error", "invalid_state_format");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  if (decodedState.type !== "calendar") {
    logger.error("Invalid state type for calendar callback", {
      type: decodedState.type,
    });
    redirectUrl.searchParams.set("error", "invalid_state_type");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  const { emailAccountId } = decodedState;

  // Update redirect URL to include emailAccountId
  redirectUrl = new URL(
    prefixPath(emailAccountId, "/calendars"),
    request.nextUrl.origin,
  );

  // Verify user owns this email account
  const session = await auth();
  if (!session?.user?.id) {
    logger.warn("Unauthorized calendar callback - no session");
    redirectUrl.searchParams.set("error", "unauthorized");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
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
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  redirectUrl.pathname = `/${emailAccountId}/calendars`;

  const googleAuth = getCalendarOAuth2Client();

  try {
    const { tokens } = await googleAuth.getToken(code);
    const { id_token, access_token, refresh_token, expiry_date } = tokens;

    if (!id_token) {
      throw new Error("Missing id_token from Google response");
    }

    if (!access_token || !refresh_token) {
      logger.warn("No refresh_token returned from Google", { emailAccountId });
      redirectUrl.searchParams.set("error", "missing_refresh_token");
      return NextResponse.redirect(redirectUrl, { headers: response.headers });
    }

    const ticket = await googleAuth.verifyIdToken({
      idToken: id_token,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload?.email) {
      throw new Error("Could not get email from ID token");
    }

    const googleEmail = payload.email;

    const existingConnection = await prisma.calendarConnection.findFirst({
      where: {
        emailAccountId,
        provider: "google",
        email: googleEmail,
      },
    });

    if (existingConnection) {
      logger.info("Calendar connection already exists", {
        emailAccountId,
        googleEmail,
      });
      redirectUrl.searchParams.set("message", "calendar_already_connected");
      return NextResponse.redirect(redirectUrl, { headers: response.headers });
    }

    const connection = await prisma.calendarConnection.create({
      data: {
        provider: "google",
        email: googleEmail,
        emailAccountId,
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: expiry_date ? new Date(expiry_date) : null,
        isConnected: true,
      },
    });

    await syncGoogleCalendars(
      connection.id,
      access_token,
      refresh_token,
      emailAccountId,
    );

    logger.info("Calendar connected successfully", {
      emailAccountId,
      googleEmail,
      connectionId: connection.id,
    });

    redirectUrl.searchParams.set("message", "calendar_connected");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  } catch (error) {
    logger.error("Error in calendar callback", { error, emailAccountId });
    redirectUrl.searchParams.set("error", "connection_failed");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }
});

async function syncGoogleCalendars(
  connectionId: string,
  accessToken: string,
  refreshToken: string,
  emailAccountId: string,
) {
  try {
    const calendarClient = await getCalendarClientWithRefresh({
      accessToken,
      refreshToken,
      expiresAt: null,
      emailAccountId,
    });

    const googleCalendars = await fetchGoogleCalendars(calendarClient);

    for (const googleCalendar of googleCalendars) {
      if (!googleCalendar.id) continue;

      await prisma.calendar.upsert({
        where: {
          connectionId_calendarId: {
            connectionId,
            calendarId: googleCalendar.id,
          },
        },
        update: {
          name: googleCalendar.summary || "Untitled Calendar",
          description: googleCalendar.description,
          timezone: googleCalendar.timeZone,
        },
        create: {
          connectionId,
          calendarId: googleCalendar.id,
          name: googleCalendar.summary || "Untitled Calendar",
          description: googleCalendar.description,
          timezone: googleCalendar.timeZone,
          isEnabled: true,
        },
      });
    }
  } catch (error) {
    logger.error("Error syncing calendars", { error, connectionId });
    await prisma.calendarConnection.update({
      where: { id: connectionId },
      data: { isConnected: false },
    });
    throw error;
  }
}
