import { type InferUITool, tool } from "ai";
import { z } from "zod";
import { LogicalOperator } from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { filterNullProperties } from "@/utils";
import {
  createRuleActionSchema,
  type RuleAction,
} from "@/utils/ai/rule/create-rule-schema";
import { isDuplicateError } from "@/utils/prisma-helpers";
import {
  partialUpdateRule,
  setRuleEnabled,
  updateRuleActions,
} from "@/utils/rule/rule";
import {
  AI_INSTRUCTIONS_PROMPT_DESCRIPTION,
  INVALID_STATIC_FROM_MESSAGE,
  isInvalidStaticFromValue,
  STATIC_FROM_CONDITION_DESCRIPTION,
} from "@/utils/ai/rule/rule-condition-descriptions";
import { hideToolErrorFromUser } from "../../tool-error-visibility";
import type { RuleReadState } from "../../chat-rule-state";
import {
  buildProviderRuleActionFields,
  buildHiddenRuleNotFoundError,
  trackRuleToolCall,
  validateRuleWasReadRecently,
} from "./shared";

export const updateRuleTool = ({
  email,
  emailAccountId,
  provider,
  logger,
  getRuleReadState,
}: {
  email: string;
  emailAccountId: string;
  provider: string;
  logger: Logger;
  getRuleReadState?: () => RuleReadState | null;
}) =>
  tool({
    description:
      "Update an existing rule after reading the user's current rules. Use this for direct requests to change rule name, enabled state, conditions, or actions; no capabilities lookup is needed before editing an existing rule. This is a patch: only fields included in updates are changed, and omitted fields are preserved. Use updates.name to rename a rule. Use updates.enabled to enable, disable, pause, or resume a rule. Use updates.condition to change conditions; omit condition fields that should stay unchanged, and set a static field to null only when the user explicitly asks to clear it. Do not set aiInstructions to null to preserve instructions; omit it instead. Use clearAiInstructions only when the user explicitly asks to remove semantic instructions. Use updates.actions to replace the full action list; when changing actions, include every action that should remain. Use DRAFT_EMAIL for draft reply actions; do not use SEND_EMAIL or REPLY when the user asks to draft. Never use this tool to add/remove a sender or domain from an existing category rule; use updateLearnedPatterns for recurring sender/domain includes and excludes instead. Direct requests to change existing rule behavior are already confirmed; do not create a replacement rule for edits.",
    inputSchema: z
      .object({
        ruleName: z.string().describe("The exact current name of the rule."),
        updates: z
          .object({
            name: z
              .string()
              .trim()
              .min(1)
              .optional()
              .describe("The new rule name, when renaming the rule."),
            enabled: z
              .boolean()
              .optional()
              .describe(
                "Whether the rule should be enabled. Use false for pause/disable, true for enable/resume.",
              ),
            condition: createPatchConditionSchema().optional(),
            actions: z
              .array(createRuleActionSchema(provider))
              .min(1, "Rules must have at least one action.")
              .optional()
              .describe(
                "The full replacement list of actions. Include existing actions that should remain.",
              ),
          })
          .refine((updates) => Object.keys(updates).length > 0, {
            message: "At least one update field is required.",
          }),
      })
      .describe("Patch update for an existing rule."),
    execute: async ({ ruleName, updates }) => {
      trackRuleToolCall({ tool: "update_rule", email, logger });
      try {
        const readValidationError = validateRuleWasReadRecently({
          ruleName,
          getRuleReadState,
        });

        if (readValidationError) {
          return hideToolErrorFromUser({
            success: false,
            error: readValidationError,
          });
        }

        const rule = await prisma.rule.findUnique({
          where: { name_emailAccountId: { name: ruleName, emailAccountId } },
          select: {
            id: true,
            name: true,
            enabled: true,
            updatedAt: true,
            instructions: true,
            from: true,
            to: true,
            subject: true,
            conditionalOperator: true,
            emailAccount: {
              select: {
                rulesRevision: true,
              },
            },
            actions: {
              select: {
                type: true,
                content: true,
                label: true,
                to: true,
                cc: true,
                bcc: true,
                subject: true,
                url: true,
                folderName: true,
                delayInMinutes: true,
              },
            },
          },
        });

        if (!rule) {
          return buildHiddenRuleNotFoundError();
        }

        const staleReadError = validateRuleWasReadRecently({
          ruleName,
          getRuleReadState,
          currentRulesRevision: rule.emailAccount.rulesRevision,
          currentRuleUpdatedAt: rule.updatedAt,
        });
        if (staleReadError) {
          return hideToolErrorFromUser({
            success: false,
            error: staleReadError,
          });
        }

        const originalConditions = {
          aiInstructions: rule.instructions,
          static: filterNullProperties({
            from: rule.from,
            to: rule.to,
            subject: rule.subject,
          }),
          conditionalOperator: rule.conditionalOperator,
        };
        const originalActions = rule.actions.map((action) => ({
          type: action.type,
          fields: filterNullProperties(
            buildProviderRuleActionFields({
              provider,
              fields: {
                label: action.label,
                content: action.content,
                to: action.to,
                cc: action.cc,
                bcc: action.bcc,
                subject: action.subject,
                webhookUrl: action.url,
                folderName: action.folderName,
              },
            }),
          ),
          delayInMinutes: action.delayInMinutes,
        }));

        if (updates.name || updates.condition) {
          await partialUpdateRule({
            ruleId: rule.id,
            emailAccountId,
            data: {
              ...(updates.name && { name: updates.name }),
              ...(updates.condition &&
                buildConditionUpdateData(updates.condition)),
            },
          });
        }

        if (updates.actions) {
          await updateRuleActions({
            ruleId: rule.id,
            actions: updates.actions.map((action) => ({
              type: action.type,
              fields: buildProviderRuleActionFields({
                provider,
                fields: action.fields ?? {},
              }),
              delayInMinutes: action.delayInMinutes ?? null,
            })),
            provider,
            emailAccountId,
            logger,
          });
        }

        if (updates.enabled !== undefined && updates.enabled !== rule.enabled) {
          await setRuleEnabled({
            ruleId: rule.id,
            emailAccountId,
            enabled: updates.enabled,
          });
        }

        return {
          success: true,
          ruleId: rule.id,
          originalName: rule.name,
          updatedName: updates.name ?? rule.name,
          originalEnabled: rule.enabled,
          updatedEnabled: updates.enabled ?? rule.enabled,
          originalConditions,
          updatedConditions: updates.condition,
          originalActions,
          updatedActions: updates.actions,
        };
      } catch (error) {
        logger.error("Failed to update rule", { error, ruleName });

        if (isDuplicateError(error, "name")) {
          return {
            success: false,
            error:
              "No rule was updated. Another rule already uses that name. Ask the user for a different name.",
          };
        }

        return {
          success: false,
          error: "Failed to update rule",
        };
      }
    },
  });

export type UpdateRuleTool = InferUITool<ReturnType<typeof updateRuleTool>>;

export type UpdateRuleOutput = {
  success: boolean;
  ruleId?: string;
  error?: string;
  originalName?: string;
  updatedName?: string;
  originalEnabled?: boolean;
  updatedEnabled?: boolean;
  originalConditions?: {
    aiInstructions: string | null;
    static?: Record<string, string | null>;
    conditionalOperator: string | null;
  };
  updatedConditions?: PatchCondition;
  originalActions?: Array<{
    type: string;
    fields: Record<string, string | null>;
    delayInMinutes?: number | null;
  }>;
  updatedActions?: RuleAction[];
};

type PatchCondition = {
  aiInstructions?: string;
  clearAiInstructions?: true;
  static?: {
    from?: string | null;
    to?: string | null;
    subject?: string | null;
  } | null;
  conditionalOperator?: LogicalOperator | null;
};

function createPatchConditionSchema() {
  return z
    .object({
      aiInstructions: z
        .string()
        .trim()
        .min(1)
        .optional()
        .describe(
          `${AI_INSTRUCTIONS_PROMPT_DESCRIPTION} Omit this field to preserve existing instructions.`,
        ),
      clearAiInstructions: z
        .literal(true)
        .optional()
        .describe(
          "Set to true only when the user explicitly asks to remove the semantic AI instructions from this rule.",
        ),
      static: z
        .object({
          from: z
            .string()
            .transform((v) => (v?.trim() ? v : null))
            .nullable()
            .optional()
            .refine((value) => !isInvalidStaticFromValue(value), {
              message: INVALID_STATIC_FROM_MESSAGE,
            })
            .describe(STATIC_FROM_CONDITION_DESCRIPTION),
          to: z.string().nullish(),
          subject: z.string().nullish(),
        })
        .nullish()
        .describe(
          "Static condition fields to patch. Omit fields to preserve them. Set a field to null only when the user explicitly asks to clear it.",
        ),
      conditionalOperator: z
        .enum([LogicalOperator.AND, LogicalOperator.OR])
        .nullish(),
    })
    .describe(
      "Condition patch. Omitted condition fields are preserved; null clears fields only when explicit.",
    );
}

function buildConditionUpdateData(condition: PatchCondition) {
  const data: {
    instructions?: string | null;
    from?: string | null;
    to?: string | null;
    subject?: string | null;
    conditionalOperator?: LogicalOperator;
  } = {};

  if (condition.clearAiInstructions) {
    data.instructions = null;
  } else if ("aiInstructions" in condition) {
    data.instructions = condition.aiInstructions;
  }

  if (condition.conditionalOperator) {
    data.conditionalOperator = condition.conditionalOperator;
  }

  if ("static" in condition) {
    if (condition.static === null) {
      data.from = null;
      data.to = null;
      data.subject = null;
    } else if (condition.static) {
      if ("from" in condition.static) data.from = condition.static.from ?? null;
      if ("to" in condition.static) data.to = condition.static.to ?? null;
      if ("subject" in condition.static) {
        data.subject = condition.static.subject ?? null;
      }
    }
  }

  return data;
}
