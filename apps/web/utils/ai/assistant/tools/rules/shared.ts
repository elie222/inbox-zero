import { z } from "zod";
import type { Logger } from "@/utils/logger";
import type {
  createRuleSchema,
  CreateOrUpdateRuleSchema,
} from "@/utils/ai/rule/create-rule-schema";
import { posthogCaptureEvent } from "@/utils/posthog";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { hideToolErrorFromUser } from "../../tool-error-visibility";
import type { RuleReadState } from "../../chat-rule-state";

export const emptyInputSchema = z.object({});

const RULE_READ_FRESHNESS_WINDOW_MS = 2 * 60 * 1000;
const RULE_NOT_FOUND_ERROR =
  "Rule not found. Try listing the rules again. The user may have made changes since you last checked.";

export function buildCreateRuleSchemaFromChatToolInput(
  input: z.infer<ReturnType<typeof createRuleSchema>>,
  provider: string,
): CreateOrUpdateRuleSchema {
  return {
    name: input.name,
    condition: input.condition,
    actions: input.actions.map((action) => ({
      type: action.type,
      fields: action.fields
        ? {
            content: action.fields.content ?? null,
            to: action.fields.to ?? null,
            subject: action.fields.subject ?? null,
            label: action.fields.label ?? null,
            webhookUrl: action.fields.webhookUrl ?? null,
            cc: action.fields.cc ?? null,
            bcc: action.fields.bcc ?? null,
            ...(isMicrosoftProvider(provider) && {
              folderName: action.fields.folderName ?? null,
            }),
          }
        : null,
      delayInMinutes: null,
    })),
  };
}

export type ChatCreateRuleToolInvocation = Parameters<
  typeof buildCreateRuleSchemaFromChatToolInput
>[0];

export async function trackRuleToolCall({
  tool,
  email,
  logger,
}: {
  tool: string;
  email: string;
  logger: Logger;
}) {
  logger.info("Tracking tool call", { tool, email });
  return posthogCaptureEvent(email, "AI Assistant Chat Tool Call", { tool });
}

export function validateRuleWasReadRecently({
  ruleName,
  getRuleReadState,
  currentRulesRevision,
  currentRuleUpdatedAt,
}: {
  ruleName: string;
  getRuleReadState?: () => RuleReadState | null;
  currentRulesRevision?: number;
  currentRuleUpdatedAt?: Date;
}) {
  const ruleReadState = getRuleReadState?.() || null;

  if (!ruleReadState) {
    return "No rule was changed. Call getUserRulesAndSettings immediately before updating this rule.";
  }

  if (Date.now() - ruleReadState.readAt > RULE_READ_FRESHNESS_WINDOW_MS) {
    return "No rule was changed. Rules may be stale. Call getUserRulesAndSettings again immediately before updating the rule.";
  }

  if (
    currentRulesRevision !== undefined &&
    ruleReadState.rulesRevision !== currentRulesRevision
  ) {
    return "No rule was changed. Rule state changed since the last read. Call getUserRulesAndSettings again, then apply the update.";
  }

  if (!currentRuleUpdatedAt) return null;

  const lastReadRuleUpdatedAt =
    ruleReadState.ruleUpdatedAtByName.get(ruleName) || null;

  if (!lastReadRuleUpdatedAt) {
    return "No rule was changed. Rule details are stale or missing. Call getUserRulesAndSettings again before updating this rule.";
  }

  if (lastReadRuleUpdatedAt !== currentRuleUpdatedAt.toISOString()) {
    return "No rule was changed. Rule changed since the last read. Call getUserRulesAndSettings again, then apply the update.";
  }

  return null;
}

export function buildHiddenRuleNotFoundError() {
  return hideToolErrorFromUser({
    success: false,
    error: RULE_NOT_FOUND_ERROR,
  });
}
