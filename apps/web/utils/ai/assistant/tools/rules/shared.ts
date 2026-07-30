import { z } from "zod";
import type { Logger } from "@/utils/logger";
import type {
  createRuleSchema,
  CreateOrUpdateRuleSchema,
} from "@/utils/ai/rule/create-rule-schema";
import { posthogCaptureEvent } from "@/utils/posthog";
import { RULE_MANAGED_BY_ORGANIZATION_ERROR } from "@/utils/organizations/rules";
import { hideToolErrorFromUser } from "../../tool-error-visibility";
import {
  type AssistantRuleSnapshot,
  buildRuleReadState,
  loadAssistantRuleSnapshot,
  type RuleReadState,
} from "../../chat-rule-state";

export const emptyInputSchema = z.object({});

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
      delayInMinutes: action.delayInMinutes ?? null,
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

export async function loadRuleSnapshotAfterWrite({
  emailAccountId,
  logger,
  setRuleReadState,
  onRulesStateExposed,
}: {
  emailAccountId: string;
  logger: Logger;
  setRuleReadState?: (state: RuleReadState) => void;
  onRulesStateExposed?: (rulesRevision: number) => void;
}): Promise<AssistantRuleSnapshot | null> {
  try {
    const snapshot = await loadAssistantRuleSnapshot({ emailAccountId });
    setRuleReadState?.(buildRuleReadState(snapshot));
    onRulesStateExposed?.(snapshot.rulesRevision);
    return snapshot;
  } catch (error) {
    logger.warn("Failed to refresh rule read state after rule write", {
      error,
    });
    return null;
  }
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

  // Deliberately no wall-clock staleness check. The read state is hydrated
  // from a live DB read within this same request, and the agent's tool budget
  // is longer than any window worth enforcing, so a time limit only rejected
  // writes from turns that spent a while searching first. The revision and
  // per-rule updatedAt comparisons below are strictly more precise, and
  // updatedAt moves on every rule write regardless of the DB trigger's column
  // list.
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

export function buildVisibleOrgManagedRuleError() {
  return {
    success: false as const,
    error: RULE_MANAGED_BY_ORGANIZATION_ERROR,
  };
}
