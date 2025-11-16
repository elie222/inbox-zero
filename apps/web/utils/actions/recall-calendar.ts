"use server";

import { actionClient } from "@/utils/actions/safe-action";
import prisma from "@/utils/prisma";
import {
  createRecallCalendar,
  deleteRecallCalendar,
} from "@/utils/recall/calendar";
import { createScopedLogger } from "@/utils/logger";
import { revalidatePath } from "next/cache";
import { SafeError } from "@/utils/error";

const logger = createScopedLogger("actions/recall-calendar");

export const createRecallCalendarAction = actionClient
  .metadata({ name: "createRecallCalendar" })
  .action(async ({ ctx: { emailAccountId } }) => {
    const connection = await prisma.calendarConnection.findFirst({
      where: {
        emailAccountId,
        isConnected: true,
      },
      include: {
        emailAccount: true,
      },
    });

    if (!connection) {
      throw new SafeError("No connected calendar found");
    }

    if (connection.recallCalendarId) {
      logger.info("Recall calendar already exists", {
        emailAccountId,
        recallCalendarId: connection.recallCalendarId,
      });

      return {
        recallCalendarId: connection.recallCalendarId,
        status: "connected" as const,
        platform: "google_calendar" as const,
      };
    }

    if (!connection.refreshToken) {
      throw new SafeError("No refresh token available for calendar connection");
    }

    const recallCalendar = await createRecallCalendar({
      oauth_refresh_token: connection.refreshToken,
    });

    await prisma.calendarConnection.update({
      where: { id: connection.id },
      data: { recallCalendarId: recallCalendar.id },
    });

    logger.info("Successfully created and linked Recall calendar", {
      emailAccountId,
      connectionId: connection.id,
      recallCalendarId: recallCalendar.id,
      platform: "google_calendar",
    });

    revalidatePath("/calendar");

    return {
      recallCalendarId: recallCalendar.id,
      status: recallCalendar.status,
      platform: recallCalendar.platform,
    };
  });

export const deleteRecallCalendarAction = actionClient
  .metadata({ name: "deleteRecallCalendar" })
  .action(async ({ ctx: { emailAccountId } }) => {
    const connections = await prisma.calendarConnection.findMany({
      where: {
        emailAccountId,
        isConnected: true,
        recallCalendarId: { not: null },
      },
    });

    if (connections.length === 0) {
      logger.info("No Recall calendars found to delete", { emailAccountId });
      return { success: true, message: "No calendars to delete" };
    }

    const results = [];

    for (const connection of connections) {
      if (connection.recallCalendarId) {
        try {
          await deleteRecallCalendar(connection.recallCalendarId);

          await prisma.calendarConnection.update({
            where: { id: connection.id },
            data: { recallCalendarId: null },
          });

          logger.info("Successfully deleted Recall calendar", {
            emailAccountId,
            connectionId: connection.id,
            recallCalendarId: connection.recallCalendarId,
          });

          results.push({
            connectionId: connection.id,
            recallCalendarId: connection.recallCalendarId,
            success: true,
          });
        } catch (error) {
          logger.error("Failed to delete Recall calendar", {
            error,
            emailAccountId,
            connectionId: connection.id,
            recallCalendarId: connection.recallCalendarId,
          });

          results.push({
            connectionId: connection.id,
            recallCalendarId: connection.recallCalendarId,
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
    }

    revalidatePath("/calendar");

    return {
      success: true,
      results,
      message: `Processed ${results.length} calendar(s)`,
    };
  });
