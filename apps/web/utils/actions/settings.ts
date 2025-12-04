"use server";

import { generateText } from "ai";
import { actionClient } from "@/utils/actions/safe-action";
import {
  saveAiSettingsBody,
  type SaveAiSettingsBody,
  saveEmailUpdateSettingsBody,
  saveDigestScheduleBody,
  updateDigestItemsBody,
} from "@/utils/actions/settings.validation";
import { DEFAULT_PROVIDER, Provider } from "@/utils/llms/config";
import prisma from "@/utils/prisma";
import { calculateNextScheduleDate } from "@/utils/schedule";
import { actionClientUser } from "@/utils/actions/safe-action";
import { ActionType } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";
import { getModel } from "@/utils/llms/model";
import type { UserAIFields } from "@/utils/llms/types";
import { SafeError } from "@/utils/error";

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
      ctx: { userId },
      parsedInput: { aiProvider, aiModel, aiApiKey, aiBaseUrl },
    }) => {
      await prisma.user.update({
        where: { id: userId },
        data:
          aiProvider === DEFAULT_PROVIDER
            ? {
                aiProvider: null,
                aiModel: null,
                aiApiKey: null,
                aiBaseUrl: null,
              }
            : { aiProvider, aiModel, aiApiKey, aiBaseUrl: aiBaseUrl || null },
      });
    },
  );

export const testAiSettingsAction = actionClientUser
  .metadata({ name: "testAiSettings" })
  .inputSchema(saveAiSettingsBody)
  .action(async ({ parsedInput, ctx }) => {
    try {
      const userAi = toUserAiFields(parsedInput);
      const modelOptions = getModel(userAi);

      await generateText({
        model: modelOptions.model,
        prompt: "Inbox Zero AI connection test",
        temperature: 0,
        maxOutputTokens: 5,
        ...(modelOptions.providerOptions
          ? { providerOptions: modelOptions.providerOptions }
          : {}),
      });

      return {
        success: true,
        provider: modelOptions.provider,
        model: modelOptions.modelName,
      };
    } catch (error) {
      ctx.logger.error("AI connection test failed", {
        provider: parsedInput.aiProvider,
        model: parsedInput.aiModel,
        error,
      });

      const message =
        error instanceof Error && error.message
          ? error.message
          : "Unable to reach the selected AI provider. Please verify your settings.";
      throw new SafeError(message);
    }
  });

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

function toUserAiFields(input: SaveAiSettingsBody): UserAIFields {
  if (input.aiProvider === DEFAULT_PROVIDER) {
    return { aiProvider: null, aiModel: null, aiApiKey: null, aiBaseUrl: null };
  }

  return {
    aiProvider: input.aiProvider,
    aiModel: input.aiModel || null,
    aiApiKey:
      input.aiProvider === Provider.OLLAMA ? null : (input.aiApiKey ?? null),
    aiBaseUrl: input.aiBaseUrl || null,
  };
}
