"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  disconnectCalendarBody,
  toggleCalendarBody,
} from "@/utils/actions/calendar.validation";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";

export const disconnectCalendarAction = actionClient
  .metadata({ name: "disconnectCalendar" })
  .inputSchema(disconnectCalendarBody)
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
  .inputSchema(toggleCalendarBody)
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
