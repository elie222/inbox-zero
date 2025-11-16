import { env } from "@/env";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import {
  fetchMicrosoftCalendars,
  getCalendarClientWithRefresh,
} from "@/utils/outlook/calendar-client";
import type { CalendarOAuthProvider, CalendarTokens } from "../oauth-types";

const logger = createScopedLogger("microsoft/calendar/provider");

export const microsoftCalendarProvider: CalendarOAuthProvider = {
  name: "microsoft",

  async exchangeCodeForTokens(code: string): Promise<CalendarTokens> {
    if (!env.MICROSOFT_CLIENT_ID || !env.MICROSOFT_CLIENT_SECRET) {
      throw new Error("Microsoft credentials not configured");
    }

    // Exchange code for tokens
    const tokenResponse = await fetch(
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          client_id: env.MICROSOFT_CLIENT_ID,
          client_secret: env.MICROSOFT_CLIENT_SECRET,
          code,
          grant_type: "authorization_code",
          redirect_uri: `${env.NEXT_PUBLIC_BASE_URL}/api/outlook/calendar/callback`,
        }),
      },
    );

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok) {
      throw new Error(
        tokens.error_description || "Failed to exchange code for tokens",
      );
    }

    // Get user profile using the access token
    const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me", {
      headers: {
        Authorization: `Bearer ${tokens.access_token}`,
      },
    });

    if (!profileResponse.ok) {
      throw new Error("Failed to fetch user profile");
    }

    const profile = await profileResponse.json();
    const microsoftEmail = profile.mail || profile.userPrincipalName;

    if (!microsoftEmail) {
      throw new Error("Profile missing required email");
    }

    if (!tokens.refresh_token) {
      throw new Error(
        "No refresh_token returned from Microsoft (ensure offline_access scope and correct app type)",
      );
    }

    return {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_in
        ? new Date(Date.now() + tokens.expires_in * 1000)
        : null,
      email: microsoftEmail,
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

      const microsoftCalendars = await fetchMicrosoftCalendars(calendarClient);

      for (const microsoftCalendar of microsoftCalendars) {
        if (!microsoftCalendar.id) continue;

        await prisma.calendar.upsert({
          where: {
            connectionId_calendarId: {
              connectionId,
              calendarId: microsoftCalendar.id,
            },
          },
          update: {
            name: microsoftCalendar.name || "Untitled Calendar",
            description: microsoftCalendar.description,
            timezone: microsoftCalendar.timeZone,
          },
          create: {
            connectionId,
            calendarId: microsoftCalendar.id,
            name: microsoftCalendar.name || "Untitled Calendar",
            description: microsoftCalendar.description,
            timezone: microsoftCalendar.timeZone,
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
