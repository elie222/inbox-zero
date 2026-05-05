"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  saveAiSettingsBody,
  saveSensitiveDataPolicyBody,
  saveEmailUpdateSettingsBody,
  saveDigestScheduleBody,
  updateDigestItemsBody,
  toggleDigestBody,
} from "@/utils/actions/settings.validation";
import { DEFAULT_PROVIDER, Provider } from "@/utils/llms/config";
import prisma from "@/utils/prisma";
import {
  calculateNextScheduleDate,
  createCanonicalTimeOfDay,
} from "@/utils/schedule";
import { actionClientUser } from "@/utils/actions/safe-action";
import { ActionType, SystemType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { clearSpecificErrorMessages, ErrorType } from "@/utils/error-messages";
import { SafeError } from "@/utils/error";
import { env } from "@/env";
import { addActionOwnershipToInput } from "@/utils/rule/rule";
import { isSensitiveDataPolicyLocked } from "@/utils/dlp/policy.server";

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
      if (aiProvider === Provider.AZURE && !env.AZURE_RESOURCE_NAME) {
        throw new Error(
          "Azure provider requires AZURE_RESOURCE_NAME to be configured on the server",
        );
      }

      const providedAiApiKey = aiApiKey?.trim() || null;

      let nextAiApiKey: string | null = providedAiApiKey;

      if (!nextAiApiKey && aiProvider !== DEFAULT_PROVIDER) {
        const existingUser = await prisma.user.findUnique({
          where: { id: userId },
          select: { aiProvider: true, aiApiKey: true },
        });

        if (!existingUser) throw new SafeError("User not found");

        nextAiApiKey =
          existingUser.aiProvider === aiProvider ? existingUser.aiApiKey : null;

        if (!nextAiApiKey) {
          throw new SafeError("You must provide an API key for this provider");
        }
      }

      const result = await prisma.user.updateMany({
        where: { id: userId },
        data:
          aiProvider === DEFAULT_PROVIDER
            ? { aiProvider: null, aiModel: null, aiApiKey: null }
            : { aiProvider, aiModel, aiApiKey: nextAiApiKey },
      });

      if (result.count === 0) {
        throw new SafeError("User not found");
      }

      // Clear AI-related error messages when user updates their settings
      // This allows them to be notified again if the new settings are also invalid
      await clearSpecificErrorMessages({
        userId,
        errorTypes: [
          ErrorType.INCORRECT_API_KEY,
          ErrorType.INVALID_AI_MODEL,
          ErrorType.API_KEY_DEACTIVATED,
          ErrorType.AI_QUOTA_ERROR,
          ErrorType.INSUFFICIENT_CREDITS,
          // Legacy keys for old stored errors
          ErrorType.INCORRECT_OPENAI_API_KEY,
          ErrorType.OPENAI_API_KEY_DEACTIVATED,
          ErrorType.ANTHROPIC_INSUFFICIENT_BALANCE,
        ],
        logger,
      });
    },
  );

export const updateSensitiveDataPolicyAction = actionClient
  .metadata({ name: "updateSensitiveDataPolicy" })
  .inputSchema(saveSensitiveDataPolicyBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { sensitiveDataPolicy },
    }) => {
      if (isSensitiveDataPolicyLocked()) {
        throw new SafeError(
          "Sensitive data protection is managed by the deployment.",
        );
      }

      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: { sensitiveDataPolicy },
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
              data: addActionOwnershipToInput(
                {
                  ruleId: rule.id,
                  type: ActionType.DIGEST,
                },
                emailAccountId,
              ),
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
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { enabled, timeOfDay },
    }) => {
      if (enabled) {
        const defaultSchedule = {
          intervalDays: 1,
          occurrences: 1,
          daysOfWeek: 127,
          timeOfDay: timeOfDay ?? createCanonicalTimeOfDay(9, 0),
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
            data: addActionOwnershipToInput(
              {
                ruleId: newsletterRule.id,
                type: ActionType.DIGEST,
              },
              emailAccountId,
            ),
          });
        }
      } else {
        await prisma.schedule.deleteMany({
          where: { emailAccountId },
        });
      }

      return { success: true };
    },
  );
