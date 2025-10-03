"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  disconnectCalendarBody,
  toggleCalendarBody,
} from "@/utils/actions/calendar.validation";
import prisma from "@/utils/prisma";
import { SafeError } from "@/utils/error";
import { deleteRecallCalendar } from "@/utils/recall/calendar";
import { revalidatePath } from "next/cache";

export const disconnectCalendarAction = actionClient
  .metadata({ name: "disconnectCalendar" })
  .schema(disconnectCalendarBody)
  .action(
    async ({
      ctx: { emailAccountId, logger },
      parsedInput: { connectionId },
    }) => {
      const connection = await prisma.calendarConnection.findFirst({
        where: {
          id: connectionId,
          emailAccountId,
        },
      });

      if (!connection) {
        throw new SafeError("Calendar connection not found");
      }

      if (connection.recallCalendarId) {
        try {
          await deleteRecallCalendar(connection.recallCalendarId);
          logger.info("Deleted calendar from Recall", {
            recallCalendarId: connection.recallCalendarId,
            connectionId,
          });
        } catch (error) {
          logger.error("Failed to delete calendar from Recall", {
            error: error instanceof Error ? error.message : error,
            recallCalendarId: connection.recallCalendarId,
            connectionId,
          });
        }
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
