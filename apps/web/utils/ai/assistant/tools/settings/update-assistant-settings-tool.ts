import { type InferUITool, tool } from "ai";
import type { Logger } from "@/utils/logger";
import {
  executeUpdateAssistantSettings,
  getUpdateAssistantSettingsValidationError,
  isNullableSettingsPath,
  trackSettingsToolCall,
  type UpdateAssistantSettingsCompatInput,
  updateAssistantSettingsCompatInputSchema,
  updateAssistantSettingsInputSchema,
} from "./shared";

export const updateAssistantSettingsTool = ({
  email,
  emailAccountId,
  userId,
  logger,
}: {
  email: string;
  emailAccountId: string;
  userId: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Update supported assistant settings. Batch multiple setting changes into one call when possible. Supported paths and values: assistant.multiRuleSelection.enabled boolean; assistant.meetingBriefs.enabled boolean; assistant.meetingBriefs.minutesBefore integer minutes from 1 to 2880; assistant.meetingBriefs.sendEmail boolean; assistant.attachmentFiling.enabled boolean; assistant.attachmentFiling.prompt string or null; assistant.scheduledCheckIns.config object with enabled, cronExpression, messagingChannelId, or prompt; assistant.draftKnowledgeBase.upsert object with title and content plus optional mode append or replace; assistant.draftKnowledgeBase.delete object with title. For personal instruction changes, use the dedicated updatePersonalInstructions tool instead.",
    inputSchema: updateAssistantSettingsCompatInputSchema,
    execute: async ({ changes }) => {
      trackSettingsToolCall({
        tool: "update_assistant_settings",
        email,
        logger,
      });
      const parsedInput = parseUpdateAssistantSettingsChanges(changes);
      if ("error" in parsedInput) return parsedInput;

      return executeUpdateAssistantSettings({
        emailAccountId,
        userId,
        logger,
        changes: parsedInput.changes,
      });
    },
  });

export const updateAssistantSettingsCompatTool = ({
  email,
  emailAccountId,
  userId,
  logger,
}: {
  email: string;
  emailAccountId: string;
  userId: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Fallback for updating assistant settings when updateAssistantSettings fails due to schema constraints. Do not use this as the first choice — always try updateAssistantSettings first.",
    inputSchema: updateAssistantSettingsCompatInputSchema,
    execute: async ({ changes }) => {
      trackSettingsToolCall({
        tool: "update_assistant_settings_compat",
        email,
        logger,
      });

      const parsedInput = parseUpdateAssistantSettingsChanges(changes);
      if ("error" in parsedInput) return parsedInput;

      return executeUpdateAssistantSettings({
        emailAccountId,
        userId,
        logger,
        changes: parsedInput.changes,
      });
    },
  });

export type UpdateAssistantSettingsTool = InferUITool<
  ReturnType<typeof updateAssistantSettingsTool>
>;

function parseUpdateAssistantSettingsChanges(
  changes: UpdateAssistantSettingsCompatInput["changes"],
) {
  const nonNullablePaths = changes
    .filter(
      (change) => change.value === null && !isNullableSettingsPath(change.path),
    )
    .map((change) => change.path);

  if (nonNullablePaths.length > 0) {
    return {
      error: `These settings cannot be set to null: ${nonNullablePaths.join(", ")}. Provide a valid value instead.`,
    };
  }

  const normalizedChanges = changes.map((change) => ({
    ...change,
    mode: change.mode ?? undefined,
  }));
  const parsedInput = updateAssistantSettingsInputSchema.safeParse({
    changes: normalizedChanges,
  });
  if (!parsedInput.success) {
    return {
      error: getUpdateAssistantSettingsValidationError(parsedInput.error),
    };
  }

  return parsedInput.data;
}
