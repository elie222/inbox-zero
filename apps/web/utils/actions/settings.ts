"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  saveAiSettingsBody,
  saveEmailUpdateSettingsBody,
  saveDigestScheduleBody,
} from "@/utils/actions/settings.validation";
import { DEFAULT_PROVIDER } from "@/utils/llms/config";
import prisma from "@/utils/prisma";
import { calculateNextFrequencyDate } from "@/utils/frequency";
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
      try {
        await prisma.user.update({
          where: { id: userId },
          data: {
            aiProvider: aiProvider || DEFAULT_PROVIDER,
            aiModel,
            aiApiKey,
          },
        });

        return { success: true };
      } catch (error) {
        throw new SafeError("Failed to update settings", 500);
      }
    },
  );

export const updateDigestScheduleAction = actionClient
  .metadata({ name: "updateDigestSchedule" })
  .schema(saveDigestScheduleBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { schedule } }) => {
    try {
      const emailAccount = await prisma.emailAccount.findUnique({
        where: { id: emailAccountId },
        select: {
          digestScheduleId: true,
        },
      });

      if (!emailAccount) {
        return { serverError: "Email account not found" };
      }

      if (schedule) {
        // Create or update the Schedule
        const scheduleRecord = await prisma.schedule.upsert({
          where: {
            emailAccountId,
          },
          create: {
            ...schedule,
            emailAccountId,
            lastOccurrenceAt: new Date(),
            nextOccurrenceAt: calculateNextFrequencyDate(schedule),
          },
          update: {
            ...schedule,
            lastOccurrenceAt: new Date(),
            nextOccurrenceAt: calculateNextFrequencyDate(schedule),
          },
        });

        // Update the email account with the new digest frequency ID
        await prisma.emailAccount.update({
          where: { id: emailAccountId },
          data: {
            digestScheduleId: scheduleRecord.id,
          },
        });
      } else if (emailAccount.digestScheduleId) {
        // If frequency is set to NEVER, delete the Schedule
        await prisma.$transaction([
          prisma.schedule.delete({
            where: {
              id: emailAccount.digestScheduleId,
            },
          }),
          prisma.emailAccount.update({
            where: { id: emailAccountId },
            data: {
              digestScheduleId: null,
            },
          }),
        ]);
      }

      return { success: true };
    } catch (error) {
      throw new SafeError("Failed to update settings", 500);
    }
  });
