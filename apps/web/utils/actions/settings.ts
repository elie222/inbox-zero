"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  saveAiSettingsBody,
  saveEmailUpdateSettingsBody,
  saveDigestScheduleBody,
} from "@/utils/actions/settings.validation";
import { DEFAULT_PROVIDER } from "@/utils/llms/config";
import prisma from "@/utils/prisma";
import { calculateNextScheduleDate } from "@/utils/schedule";
import { actionClientUser } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";

export const updateEmailSettingsAction = actionClient
  .metadata({ name: "updateEmailSettings" })
  .schema(saveEmailUpdateSettingsBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { statsEmailFrequency, summaryEmailFrequency },
    }) => {
      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: {
          statsEmailFrequency,
          summaryEmailFrequency,
        },
      });
    },
  );

export const updateAiSettingsAction = actionClientUser
  .metadata({ name: "updateAiSettings" })
  .schema(saveAiSettingsBody)
  .action(
    async ({
      ctx: { userId },
      parsedInput: { aiProvider, aiModel, aiApiKey },
    }) => {
      await prisma.user.update({
        where: { id: userId },
        data:
          aiProvider === DEFAULT_PROVIDER
            ? { aiProvider: null, aiModel: null, aiApiKey: null }
            : { aiProvider, aiModel, aiApiKey },
      });
    },
  );

export const updateDigestScheduleAction = actionClient
  .metadata({ name: "updateDigestSchedule" })
  .schema(saveDigestScheduleBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { schedule } }) => {
    try {
      // Check if email account exists
      const emailAccount = await prisma.emailAccount.findUnique({
        where: { id: emailAccountId },
        select: { id: true },
      });

      if (!emailAccount) {
        return { serverError: "Email account not found" };
      }

      if (schedule) {
        // Create or update the Schedule
        await prisma.schedule.upsert({
          where: {
            emailAccountId,
          },
          create: {
            emailAccountId,
            intervalDays: schedule.intervalDays,
            daysOfWeek: schedule.daysOfWeek,
            timeOfDay: schedule.timeOfDay,
            occurrences: schedule.occurrences,
            lastOccurrenceAt: new Date(),
            nextOccurrenceAt: calculateNextScheduleDate(schedule),
          },
          update: {
            intervalDays: schedule.intervalDays,
            daysOfWeek: schedule.daysOfWeek,
            timeOfDay: schedule.timeOfDay,
            occurrences: schedule.occurrences,
            lastOccurrenceAt: new Date(),
            nextOccurrenceAt: calculateNextScheduleDate(schedule),
          },
        });
      } else {
        // If schedule is null, delete the existing schedule if it exists
        await prisma.schedule.deleteMany({
          where: { emailAccountId },
        });
      }

      return { success: true };
    } catch (error) {
      throw new SafeError("Failed to update settings", 500);
    }
  });
