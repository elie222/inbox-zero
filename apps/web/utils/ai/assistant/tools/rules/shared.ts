import { z } from "zod";
import type { Logger } from "@/utils/logger";
import type {
  createRuleSchema,
  CreateOrUpdateRuleSchema,
} from "@/utils/ai/rule/create-rule-schema";
import { posthogCaptureEvent } from "@/utils/posthog";
import { hideToolErrorFromUser } from "../../tool-error-visibility";
import type { RuleReadState } from "../../chat-rule-state";

export const emptyInputSchema = z.object({});

const RULE_READ_FRESHNESS_WINDOW_MS = 2 * 60 * 1000;
const RULE_NOT_FOUND_ERROR =
  "Rule not found. Try listing the rules again. The user may have made changes since you last checked.";

type RuleActionFieldValues = {
  content?: string | null;
  to?: string | null;
  subject?: string | null;
  label?: string | null;
  webhookUrl?: string | null;
  cc?: string | null;
  bcc?: string | null;
  folderName?: string | null;
};

const providerRuleActionFieldBuilders: Record<
  string,
  (fields: RuleActionFieldValues) => RuleActionFieldValues
> = {
  microsoft: (fields) => ({
    folderName: fields.folderName ?? null,
  }),
};

export function buildProviderRuleActionFields({
  provider,
  fields,
}: {
  provider: string;
  fields: RuleActionFieldValues;
}): RuleActionFieldValues {
  return {
    content: fields.content ?? null,
    to: fields.to ?? null,
    subject: fields.subject ?? null,
    label: fields.label ?? null,
    webhookUrl: fields.webhookUrl ?? null,
    cc: fields.cc ?? null,
    bcc: fields.bcc ?? null,
    ...(providerRuleActionFieldBuilders[provider]?.(fields) ?? {}),
  };
}

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
        ? buildProviderRuleActionFields({ provider, fields: action.fields })
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
