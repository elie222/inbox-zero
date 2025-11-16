import { env } from "@/env";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import {
  getCalendarOAuth2Client,
  fetchGoogleCalendars,
  getCalendarClientWithRefresh,
} from "@/utils/calendar/client";
import type { CalendarOAuthProvider, CalendarTokens } from "../oauth-types";

const logger = createScopedLogger("google/calendar/provider");

export const googleCalendarProvider: CalendarOAuthProvider = {
  name: "google",

  async exchangeCodeForTokens(code: string): Promise<CalendarTokens> {
    const googleAuth = getCalendarOAuth2Client();

    const { tokens } = await googleAuth.getToken(code);
    const { id_token, access_token, refresh_token, expiry_date } = tokens;

    if (!id_token) {
      throw new Error("Missing id_token from Google response");
    }

    if (!access_token || !refresh_token) {
      throw new Error("No refresh_token returned from Google");
    }

    const ticket = await googleAuth.verifyIdToken({
      idToken: id_token,
      audience: env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();

    if (!payload?.email) {
      throw new Error("Could not get email from ID token");
    }

    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: expiry_date ? new Date(expiry_date) : null,
      email: payload.email,
    };
  },

  async syncCalendars(
    connectionId: string,
    accessToken: string,
    refreshToken: string,
    emailAccountId: string,
    expiresAt: Date | null,
  ): Promise<void> {
    try {
      const calendarClient = await getCalendarClientWithRefresh({
        accessToken,
        refreshToken,
        expiresAt: expiresAt?.getTime() ?? null,
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
  },
};
