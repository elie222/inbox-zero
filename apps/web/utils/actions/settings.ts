"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  saveAiSettingsBody,
  saveEmailUpdateSettingsBody,
  saveDigestScheduleBody,
  updateDigestItemsBody,
} from "@/utils/actions/settings.validation";
import { DEFAULT_PROVIDER } from "@/utils/llms/config";
import prisma from "@/utils/prisma";
import { calculateNextScheduleDate } from "@/utils/schedule";
import { actionClientUser } from "@/utils/actions/safe-action";
import { ActionType, type Prisma } from "@prisma/client";
import { createScopedLogger } from "@/utils/logger";

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
  .action(async ({ ctx: { emailAccountId }, parsedInput }) => {
    const { intervalDays, daysOfWeek, timeOfDay, occurrences } = parsedInput;

    const create: Prisma.ScheduleUpsertArgs["create"] = {
      emailAccountId,
      intervalDays,
      daysOfWeek,
      timeOfDay,
      occurrences,
      lastOccurrenceAt: new Date(),
      nextOccurrenceAt: calculateNextScheduleDate(parsedInput),
    };

    // remove emailAccountId for update
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
  .schema(updateDigestItemsBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { ruleDigestPreferences, coldEmailDigest },
    }) => {
      const logger = createScopedLogger("updateDigestItems").with({
        emailAccountId,
      });

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

      // Handle cold email digest setting separately
      if (coldEmailDigest !== undefined) {
        promises.push(
          prisma.emailAccount
            .update({
              where: { id: emailAccountId },
              data: { coldEmailDigest },
            })
            .then(() => {}),
        );
      }

      await Promise.all(promises);
      return { success: true };
    },
  );
