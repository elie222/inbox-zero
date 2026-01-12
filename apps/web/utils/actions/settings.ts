"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  saveAiSettingsBody,
  saveEmailUpdateSettingsBody,
  saveDigestScheduleBody,
  updateDigestItemsBody,
  toggleDigestBody,
} from "@/utils/actions/settings.validation";
import { DEFAULT_PROVIDER } from "@/utils/llms/config";
import prisma from "@/utils/prisma";
import {
  calculateNextScheduleDate,
  createCanonicalTimeOfDay,
} from "@/utils/schedule";
import { actionClientUser } from "@/utils/actions/safe-action";
import { ActionType, SystemType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { clearSpecificErrorMessages, ErrorType } from "@/utils/error-messages";

export const updateEmailSettingsAction = actionClient
  .metadata({ name: "updateEmailSettings" })
  .inputSchema(saveEmailUpdateSettingsBody)
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
  .inputSchema(saveAiSettingsBody)
  .action(
    async ({
      ctx: { userId, logger },
      parsedInput: { aiProvider, aiModel, aiApiKey },
    }) => {
      await prisma.user.update({
        where: { id: userId },
        data:
          aiProvider === DEFAULT_PROVIDER
            ? { aiProvider: null, aiModel: null, aiApiKey: null }
            : { aiProvider, aiModel, aiApiKey },
      });

      // Clear AI-related error messages when user updates their settings
      // This allows them to be notified again if the new settings are also invalid
      await clearSpecificErrorMessages({
        userId,
        errorTypes: [
          ErrorType.INCORRECT_OPENAI_API_KEY,
          ErrorType.INVALID_AI_MODEL,
          ErrorType.OPENAI_API_KEY_DEACTIVATED,
          ErrorType.AI_QUOTA_ERROR,
          ErrorType.ANTHROPIC_INSUFFICIENT_BALANCE,
        ],
        logger,
      });
    },
  );

export const updateDigestScheduleAction = actionClient
  .metadata({ name: "updateDigestSchedule" })
  .inputSchema(saveDigestScheduleBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    const { intervalDays, daysOfWeek, timeOfDay, occurrences } = parsedInput;

    const create: Prisma.ScheduleUpsertArgs["create"] = {
      emailAccountId,
      intervalDays,
      daysOfWeek,
      timeOfDay,
      occurrences,
      lastOccurrenceAt: new Date(),
      nextOccurrenceAt: calculateNextScheduleDate({
        ...parsedInput,
        lastOccurrenceAt: null,
      }),
    };

    const { emailAccountId: _emailAccountId, ...update } = create;

    await prisma.schedule.upsert({
      where: { emailAccountId },
      create,
      update,
    });

    return { success: true };
  });

export const updateDigestItemsAction = actionClient
  .metadata({ name: "updateDigestItems" })
  .inputSchema(updateDigestItemsBody)
  .action(
    async ({
      ctx: { emailAccountId, logger },
      parsedInput: { ruleDigestPreferences },
    }) => {
      const promises = Object.entries(ruleDigestPreferences).map(
        async ([ruleId, enabled]) => {
          // Verify the rule belongs to this email account
          const rule = await prisma.rule.findUnique({
            where: {
              id: ruleId,
              emailAccountId,
            },
            select: { id: true, actions: true },
          });

          if (!rule) {
            logger.error("Rule not found", { ruleId });
            return;
          }

          const hasDigestAction = rule.actions.some(
            (action) => action.type === ActionType.DIGEST,
          );

          if (enabled && !hasDigestAction) {
            // Add DIGEST action
            await prisma.action.create({
              data: {
                ruleId: rule.id,
                type: ActionType.DIGEST,
              },
            });
          } else if (!enabled && hasDigestAction) {
            // Remove DIGEST action
            await prisma.action.deleteMany({
              where: {
                ruleId: rule.id,
                type: ActionType.DIGEST,
              },
            });
          }
        },
      );

      await Promise.all(promises);
      return { success: true };
    },
  );

export const toggleDigestAction = actionClient
  .metadata({ name: "toggleDigest" })
  .inputSchema(toggleDigestBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { enabled } }) => {
    if (enabled) {
      const defaultSchedule = {
        intervalDays: 1,
        occurrences: 1,
        daysOfWeek: 127,
        timeOfDay: createCanonicalTimeOfDay(9, 0),
      };

      await prisma.schedule.upsert({
        where: { emailAccountId },
        create: {
          emailAccountId,
          ...defaultSchedule,
          lastOccurrenceAt: new Date(),
          nextOccurrenceAt: calculateNextScheduleDate({
            ...defaultSchedule,
            lastOccurrenceAt: null,
          }),
        },
        update: {},
      });

      const newsletterRule = await prisma.rule.findFirst({
        where: { emailAccountId, systemType: SystemType.NEWSLETTER },
        include: { actions: true },
      });

      if (
        newsletterRule &&
        !newsletterRule.actions.some((a) => a.type === ActionType.DIGEST)
      ) {
        await prisma.action.create({
          data: { ruleId: newsletterRule.id, type: ActionType.DIGEST },
        });
      }
    } else {
      await prisma.schedule.deleteMany({
        where: { emailAccountId },
      });
    }

    return { success: true };
  });
