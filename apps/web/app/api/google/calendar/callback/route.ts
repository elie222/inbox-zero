import { type NextRequest, NextResponse } from "next/server";
import { env } from "@/env";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import {
  getCalendarOAuth2Client,
  fetchGoogleCalendars,
  getCalendarClientWithRefresh,
} from "@/utils/calendar/client";
import { withError } from "@/utils/middleware";

const logger = createScopedLogger("google/calendar/callback");

export const GET = withError(async (request: NextRequest) => {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");

  const redirectUrl = new URL("/settings", request.nextUrl.origin);
  const response = NextResponse.redirect(redirectUrl);

  if (!code || !state) {
    logger.warn("Missing code or state in Google Calendar callback");
    redirectUrl.searchParams.set("error", "missing_parameters");
    return NextResponse.redirect(redirectUrl, { headers: response.headers });
  }

  let decodedState: { emailAccountId: string; type: string };
  try {
    decodedState = JSON.parse(state);
  } catch (error) {
    logger.error("Failed to decode state", { error });
    redirectUrl.searchParams.set("error", "invalid_state");
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
  const googleAuth = getCalendarOAuth2Client();

  try {
    const { tokens } = await googleAuth.getToken(code);
    const { id_token, access_token, refresh_token, expiry_date } = tokens;

    if (!id_token) {
      throw new Error("Missing id_token from Google response");
    }

    // Verify the ID token to get user info
    const ticket = await googleAuth.verifyIdToken({
      idToken: id_token,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload?.email) {
      throw new Error("Could not get email from ID token");
    }

    const googleEmail = payload.email;

    // Check if calendar connection already exists
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

    // Create calendar connection
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

    // Sync calendars
    await syncGoogleCalendars(
      connection.id,
      access_token!,
      refresh_token!,
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
    // Use the existing calendar client with refresh functionality
    const calendarClient = await getCalendarClientWithRefresh({
      accessToken,
      refreshToken,
      expiresAt: null, // Force refresh to ensure we have valid tokens
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
    // Mark connection as disconnected on error
    await prisma.calendarConnection.update({
      where: { id: connectionId },
      data: { isConnected: false },
    });
    throw error;
  }
}
