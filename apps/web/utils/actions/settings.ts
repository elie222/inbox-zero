"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  saveAiSettingsBody,
  saveEmailUpdateSettingsBody,
  saveDigestFrequencyBody,
} from "@/utils/actions/settings.validation";
import { DEFAULT_PROVIDER } from "@/utils/llms/config";
import prisma from "@/utils/prisma";
import { calculateNextFrequencyDate } from "@/utils/frequency";
import { actionClientUser } from "@/utils/actions/safe-action";

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
        return { serverError: "Failed to update settings" };
      }
    },
  );

export const updateDigestFrequencyAction = actionClient
  .metadata({ name: "updateDigestFrequency" })
  .schema(saveDigestFrequencyBody)
  .action(
    async ({ ctx: { emailAccountId }, parsedInput: { userFrequency } }) => {
      try {
        const emailAccount = await prisma.emailAccount.findUnique({
          where: { id: emailAccountId },
          include: { digestFrequency: true },
        });

        if (!emailAccount) {
          return { serverError: "Email account not found" };
        }

        await prisma.$transaction(async (tx) => {
          if (userFrequency) {
            // Create or update the UserFrequency
            const userFrequencyRecord = await tx.userFrequency.upsert({
              where: {
                emailAccountId,
              },
              create: {
                ...userFrequency,
                emailAccountId,
                lastOccurrenceAt: new Date(),
                nextOccurrenceAt: calculateNextFrequencyDate(userFrequency),
              },
              update: {
                ...userFrequency,
                lastOccurrenceAt: new Date(),
                nextOccurrenceAt: calculateNextFrequencyDate(userFrequency),
              },
            });

            // Update the email account with the new digest frequency ID
            await tx.emailAccount.update({
              where: { id: emailAccountId },
              data: {
                digestFrequencyId: userFrequencyRecord.id,
              },
            });
          } else if (emailAccount.digestFrequencyId) {
            // If frequency is set to NEVER, delete the UserFrequency
            await tx.userFrequency.delete({
              where: {
                id: emailAccount.digestFrequencyId,
              },
            });

            // Update the email account to remove the digest frequency ID
            await tx.emailAccount.update({
              where: { id: emailAccountId },
              data: {
                digestFrequencyId: null,
              },
            });
          }
        });

        return { success: true };
      } catch (error) {
        return { serverError: "Failed to update settings" };
      }
    },
  );
