"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  saveAiSettingsBody,
  saveEmailUpdateSettingsBody,
  saveDigestScheduleBody,
  updateDigestCategoriesBody,
} from "@/utils/actions/settings.validation";
import { DEFAULT_PROVIDER } from "@/utils/llms/config";
import prisma from "@/utils/prisma";
import { calculateNextScheduleDate } from "@/utils/schedule";
import { actionClientUser } from "@/utils/actions/safe-action";
import { SafeError } from "@/utils/error";
import { SystemType, ActionType } from "@prisma/client";

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

export const updateDigestCategoriesAction = actionClient
  .metadata({ name: "updateDigestCategories" })
  .schema(updateDigestCategoriesBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: {
        toReply,
        newsletter,
        marketing,
        calendar,
        receipt,
        notification,
        coldEmail,
      },
    }) => {
      const promises: Promise<any>[] = [];

      // Update cold email digest setting
      if (coldEmail !== undefined) {
        promises.push(
          prisma.emailAccount.update({
            where: { id: emailAccountId },
            data: { coldEmailDigest: coldEmail },
          }),
        );
      }

      // Update rule digest settings
      const systemTypeMap = {
        toReply: SystemType.TO_REPLY,
        newsletter: SystemType.NEWSLETTER,
        marketing: SystemType.MARKETING,
        calendar: SystemType.CALENDAR,
        receipt: SystemType.RECEIPT,
        notification: SystemType.NOTIFICATION,
      };

      for (const [key, systemType] of Object.entries(systemTypeMap)) {
        const value = {
          toReply,
          newsletter,
          marketing,
          calendar,
          receipt,
          notification,
        }[key as keyof typeof systemTypeMap];

        if (value !== undefined) {
          const promise = async () => {
            const rule = await prisma.rule.findUnique({
              where: {
                emailAccountId_systemType: {
                  emailAccountId,
                  systemType,
                },
              },
              select: { id: true, actions: true },
            });

            if (!rule) return;

            const hasDigestAction = rule.actions.some(
              (action) => action.type === ActionType.DIGEST,
            );

            if (value && !hasDigestAction) {
              // Add DIGEST action
              await prisma.action.create({
                data: {
                  ruleId: rule.id,
                  type: ActionType.DIGEST,
                },
              });
            } else if (!value && hasDigestAction) {
              // Remove DIGEST action
              await prisma.action.deleteMany({
                where: {
                  ruleId: rule.id,
                  type: ActionType.DIGEST,
                },
              });
            }
          };

          promises.push(promise());
        }
      }

      await Promise.all(promises);
      return { success: true };
    },
  );
