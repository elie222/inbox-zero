"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  disconnectCalendarBody,
  toggleCalendarBody,
} from "@/utils/actions/calendar.validation";
import prisma from "@/utils/prisma";
import { redirect } from "next/navigation";
import { getCalendarOAuth2Client } from "@/utils/calendar/client";
import { CALENDAR_SCOPES as GOOGLE_CALENDAR_SCOPES } from "@/utils/gmail/scopes";
import { SafeError } from "@/utils/error";

export const connectGoogleCalendarAction = actionClient
  .metadata({ name: "connectGoogleCalendar" })
  .action(async ({ ctx: { emailAccountId } }) => {
    const oauth2Client = getCalendarOAuth2Client();

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: GOOGLE_CALENDAR_SCOPES,
      state: JSON.stringify({
        emailAccountId,
        type: "calendar",
      }),
      prompt: "consent",
    });

    redirect(authUrl);
  });

export const disconnectCalendarAction = actionClient
  .metadata({ name: "disconnectCalendar" })
  .schema(disconnectCalendarBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { connectionId } }) => {
      const connection = await prisma.calendarConnection.findFirst({
        where: {
          id: connectionId,
          emailAccountId,
        },
      });

      if (!connection) {
        throw new SafeError("Calendar connection not found");
      }

      await prisma.calendarConnection.delete({
        where: { id: connectionId },
      });

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
      const updatedCalendar = await prisma.calendar.updateMany({
        where: {
          id: calendarId,
          connection: {
            emailAccountId,
          },
        },
        data: { isEnabled },
      });

      if (updatedCalendar.count === 0) {
        throw new SafeError("Calendar not found");
      }

      return { success: true };
    },
  );
