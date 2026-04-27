import { type InferUITool, tool } from "ai";
import type { Logger } from "@/utils/logger";
import {
  executeUpdateAssistantSettings,
  getUpdateAssistantSettingsValidationError,
  isNullableSettingsPath,
  trackSettingsToolCall,
  updateAssistantSettingsInputSchema,
  type UpdateAssistantSettingsLlmInput,
  updateAssistantSettingsLlmInputSchema,
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
      "Update supported assistant settings. This is the primary tool for writing account settings. Batch multiple setting changes into one call when possible. Supported categories: meeting briefs, attachment filing, multi-rule selection, scheduled check-ins, and draft knowledge base. For personal instruction changes, use the dedicated updatePersonalInstructions tool instead.",
    inputSchema: updateAssistantSettingsLlmInputSchema,
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

export type UpdateAssistantSettingsTool = InferUITool<
  ReturnType<typeof updateAssistantSettingsTool>
>;

function parseUpdateAssistantSettingsChanges(
  changes: UpdateAssistantSettingsLlmInput["changes"],
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
