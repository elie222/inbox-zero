import { type InferUITool, tool } from "ai";
import type { Logger } from "@/utils/logger";
import {
  executeUpdateAssistantSettings,
  getUpdateAssistantSettingsValidationError,
  isNullableSettingsPath,
  trackSettingsToolCall,
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
      "Update supported assistant settings. This is the primary tool for writing account settings — always prefer this over updateAssistantSettingsCompat. Batch multiple setting changes into one call when possible. Supported categories: meeting briefs, attachment filing, multi-rule selection, scheduled check-ins, and draft knowledge base. For personal instruction changes, use the dedicated updatePersonalInstructions tool instead.",
    inputSchema: updateAssistantSettingsInputSchema,
    execute: async ({ changes }) => {
      trackSettingsToolCall({
        tool: "update_assistant_settings",
        email,
        logger,
      });
      return executeUpdateAssistantSettings({
        emailAccountId,
        userId,
        logger,
        changes,
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

      const nonNullablePaths = changes
        .filter(
          (change) =>
            change.value === null && !isNullableSettingsPath(change.path),
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

      return executeUpdateAssistantSettings({
        emailAccountId,
        userId,
        logger,
        changes: parsedInput.data.changes,
      });
    },
  });

export type UpdateAssistantSettingsTool = InferUITool<
  ReturnType<typeof updateAssistantSettingsTool>
>;
