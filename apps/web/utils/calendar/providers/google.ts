import prisma from "@/utils/prisma";
import type { Logger } from "@/utils/logger";
import { env } from "@/env";
import {
  getCalendarOAuth2Client,
  fetchGoogleCalendars,
  getCalendarClientWithRefresh,
} from "@/utils/calendar/client";
import {
  fetchGoogleOpenIdProfile,
  isGoogleOauthEmulationEnabled,
} from "@/utils/google/oauth";
import type { CalendarOAuthProvider, CalendarTokens } from "../oauth-types";
import { autoPopulateTimezone } from "../timezone-helpers";

export function createGoogleCalendarProvider(
  logger: Logger,
): CalendarOAuthProvider {
  return {
    name: "google",

    async exchangeCodeForTokens(code: string): Promise<CalendarTokens> {
      const googleAuth = getCalendarOAuth2Client();

      const { tokens } = await googleAuth.getToken(code);
      const { access_token, refresh_token, expiry_date } = tokens;

      if (!access_token || !refresh_token) {
        throw new Error("No refresh_token returned from Google");
      }

      const payload = isGoogleOauthEmulationEnabled()
        ? await fetchGoogleOpenIdProfile(access_token)
        : await verifyGoogleIdTokenPayload(googleAuth, tokens.id_token);
      const email = payload.email;

      if (!email) {
        throw new Error("Could not get email from Google profile");
      }

      return {
        accessToken: access_token,
        refreshToken: refresh_token,
        expiresAt: expiry_date ? new Date(expiry_date) : null,
        email,
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
          connectionId,
          logger,
        });

        const googleCalendars = await fetchGoogleCalendars(
          calendarClient,
          logger,
        );

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
              primary: googleCalendar.primary ?? false,
            },
            create: {
              connectionId,
              calendarId: googleCalendar.id,
              name: googleCalendar.summary || "Untitled Calendar",
              description: googleCalendar.description,
              timezone: googleCalendar.timeZone,
              primary: googleCalendar.primary ?? false,
              isEnabled: true,
            },
          });
        }

        await autoPopulateTimezone(emailAccountId, googleCalendars, logger);
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
}

async function verifyGoogleIdTokenPayload(
  googleAuth: ReturnType<typeof getCalendarOAuth2Client>,
  idToken: string | null | undefined,
) {
  if (!idToken) {
    throw new Error("Missing id_token from Google response");
  }

  const ticket = await googleAuth.verifyIdToken({
    idToken,
    audience: env.GOOGLE_CLIENT_ID,
  });
  const payload = ticket.getPayload();

  if (!payload?.email) {
    throw new Error("Could not get email from ID token");
  }

  return payload;
}
