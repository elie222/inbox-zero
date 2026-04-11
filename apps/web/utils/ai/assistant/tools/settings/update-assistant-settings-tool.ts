import { type InferUITool, tool } from "ai";
import type { Logger } from "@/utils/logger";
import {
  executeUpdateAssistantSettings,
  getUpdateAssistantSettingsValidationError,
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
      "Update supported assistant settings using a structured patch. Each changes[] entry must specify a supported assistant.* path plus its value, and include mode only for fields that support append/replace behavior. Never use legacy top-level keys like meetingBriefsEnabled, attachmentFilingEnabled, or multiRuleSelectionEnabled. Use this directly for known supported settings like multi-rule selection, meeting briefs, meeting-brief email delivery, attachment filing, scheduled check-ins, and draft knowledge base management. Meeting-brief email delivery maps to assistant.meetingBriefs.sendEmail. Prefer one call with all related changes from the same request instead of splitting them across repeated updateAssistantSettings calls. Use getAssistantCapabilities first only when the target setting is unclear or the user is asking what can be changed.",
    inputSchema: updateAssistantSettingsInputSchema,
    execute: async ({ changes, dryRun }) => {
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
        dryRun,
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
      "Update supported assistant settings using a compact payload. Each changes[] entry must specify a supported assistant.* path plus its value, and include mode only for fields that support append/replace behavior. Never use legacy top-level keys like meetingBriefsEnabled, attachmentFilingEnabled, or multiRuleSelectionEnabled. Use this directly for known supported settings like multi-rule selection, meeting briefs, meeting-brief email delivery, attachment filing, scheduled check-ins, and draft knowledge base management. Meeting-brief email delivery maps to assistant.meetingBriefs.sendEmail. Prefer one call with all related changes from the same request instead of splitting them across repeated updateAssistantSettings calls. Use getAssistantCapabilities first only when the target setting is unclear or the user is asking what can be changed.",
    inputSchema: updateAssistantSettingsCompatInputSchema,
    execute: async ({ changes, dryRun }) => {
      trackSettingsToolCall({
        tool: "update_assistant_settings_compat",
        email,
        logger,
      });

      const normalizedChanges = changes.map((c) => ({
        ...c,
        mode: c.mode ?? undefined,
      }));
      const parsedInput = updateAssistantSettingsInputSchema.safeParse({
        changes: normalizedChanges,
        dryRun,
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
        dryRun: parsedInput.data.dryRun,
      });
    },
  });

export type UpdateAssistantSettingsTool = InferUITool<
  ReturnType<typeof updateAssistantSettingsTool>
>;
