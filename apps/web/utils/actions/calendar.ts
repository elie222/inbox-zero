"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  disconnectCalendarBody,
  toggleCalendarBody,
} from "@/utils/actions/calendar.validation";
import prisma from "@/utils/prisma";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getCalendarOAuth2Client } from "@/utils/calendar/client";
import { CALENDAR_SCOPES } from "@/utils/calendar/scopes";

export const connectGoogleCalendarAction = actionClient
  .metadata({ name: "connectGoogleCalendar" })
  .action(async ({ ctx: { emailAccountId } }) => {
    const oauth2Client = getCalendarOAuth2Client();

    const authUrl = oauth2Client.generateAuthUrl({
      access_type: "offline",
      scope: CALENDAR_SCOPES,
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
        throw new Error("Calendar connection not found");
      }

      await prisma.calendarConnection.delete({
        where: { id: connectionId },
      });

      revalidatePath("/calendars");
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
        throw new Error("Calendar not found");
      }

      revalidatePath("/[emailAccountId]/calendars", "page");
      return { success: true };
    },
  );
