"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  disconnectCalendarBody,
  toggleCalendarBody,
} from "@/utils/actions/calendar.validation";
import prisma from "@/utils/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getCalendarClientWithRefresh,
  fetchGoogleCalendars,
  getCalendarOAuth2Client,
} from "@/utils/calendar/client";
import { CALENDAR_SCOPES } from "@/utils/calendar/scopes";

export const connectGoogleCalendarAction = actionClient
  .metadata({ name: "connectGoogleCalendar" })
  .action(async ({ ctx: { emailAccountId } }) => {
    // Create OAuth2 client for calendar permissions
    const oauth2Client = getCalendarOAuth2Client();

    // Generate auth URL with calendar scopes
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: CALENDAR_SCOPES,
      state: JSON.stringify({
        emailAccountId,
        type: "calendar",
      }),
      prompt: "consent", // Force consent to ensure we get refresh token
    });

    // Redirect to Google OAuth for calendar permissions
    redirect(authUrl);
  });

export const disconnectCalendarAction = actionClient
  .metadata({ name: "disconnectCalendar" })
  .schema(disconnectCalendarBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { connectionId } }) => {
      // Verify the connection belongs to this email account
      const connection = await prisma.calendarConnection.findFirst({
        where: {
          id: connectionId,
          emailAccountId,
        },
      });

      if (!connection) {
        throw new Error("Calendar connection not found");
      }

      // Delete the connection and all associated calendars
      await prisma.calendarConnection.delete({
        where: { id: connectionId },
      });

      revalidatePath("/settings");
      return { success: true };
    },
  );

export const toggleCalendarAction = actionClient
  .metadata({ name: "toggleCalendar" })
  .schema(toggleCalendarBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { calendarId, isEnabled },
    }) => {
      // Verify the calendar belongs to this email account
      const calendar = await prisma.calendar.findFirst({
        where: {
          id: calendarId,
          connection: {
            emailAccountId,
          },
        },
      });

      if (!calendar) {
        throw new Error("Calendar not found");
      }

      await prisma.calendar.update({
        where: { id: calendarId },
        data: { isEnabled },
      });

      revalidatePath("/settings");
      return { success: true };
    },
  );
