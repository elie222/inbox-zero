"use server";

import { z } from "zod";
import { actionClient } from "@/utils/actions/safe-action";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import { SafeError } from "@/utils/error";

const logger = createScopedLogger("actions/transcript-settings");

export const updateTranscriptsForAllCalendarsAction = actionClient
  .metadata({ name: "updateTranscriptsForAllCalendars" })
  .schema(
    z.object({
      transcriptEnabled: z.boolean(),
    }),
  )
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { transcriptEnabled } }) => {
      const connections = await prisma.calendarConnection.findMany({
        where: {
          emailAccountId,
          isConnected: true,
        },
        include: {
          calendars: {
            where: { isEnabled: true },
          },
        },
      });

      if (connections.length === 0) {
        throw new SafeError("No connected calendars found");
      }

      let totalCalendars = 0;
      for (const connection of connections) {
        if (connection.calendars.length > 0) {
          await prisma.calendar.updateMany({
            where: {
              connectionId: connection.id,
              isEnabled: true,
            },
            data: {
              transcriptEnabled,
            },
          });
          totalCalendars += connection.calendars.length;
        }
      }

      logger.info("Updated transcript setting for all calendars", {
        emailAccountId,
        transcriptEnabled,
        calendarCount: totalCalendars,
      });

      return {
        transcriptEnabled,
        calendarCount: totalCalendars,
      };
    },
  );
