import { type InferUITool, tool } from "ai";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { filterNullProperties } from "@/utils";
import { updateRuleConditionSchema } from "@/utils/actions/rule.validation";
import { partialUpdateRule } from "@/utils/rule/rule";
import { hideToolErrorFromUser } from "../../tool-error-visibility";
import type { RuleReadState } from "../../chat-rule-state";
import {
  buildHiddenRuleNotFoundError,
  trackRuleToolCall,
  validateRuleWasReadRecently,
} from "./shared";

export const updateRuleConditionsTool = ({
  email,
  emailAccountId,
  logger,
  getRuleReadState,
}: {
  email: string;
  emailAccountId: string;
  logger: Logger;
  getRuleReadState?: () => RuleReadState | null;
}) =>
  tool({
    description:
      "Update the conditions of an existing rule. Conversation-status corrections (To Reply, FYI, Awaiting Reply, Actioned) should use this tool to update the existing conversation rule instead of creating a new rule. Keep conversation rule instructions self-contained and preserve the core intent when editing them.",
    inputSchema: updateRuleConditionSchema,
    execute: async ({ ruleName, condition }) => {
      trackRuleToolCall({ tool: "update_rule_conditions", email, logger });
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
            updatedAt: true,
            emailAccount: {
              select: {
                rulesRevision: true,
              },
            },
            instructions: true,
            from: true,
            to: true,
            subject: true,
            conditionalOperator: true,
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

        await partialUpdateRule({
          ruleId: rule.id,
          emailAccountId,
          data: {
            instructions: condition.aiInstructions,
            from: condition.static?.from,
            to: condition.static?.to,
            subject: condition.static?.subject,
            conditionalOperator: condition.conditionalOperator ?? undefined,
          },
        });

        const updatedConditions = {
          aiInstructions: condition.aiInstructions,
          static: condition.static
            ? filterNullProperties({
                from: condition.static.from,
                to: condition.static.to,
                subject: condition.static.subject,
              })
            : undefined,
          conditionalOperator: condition.conditionalOperator,
        };

        return {
          success: true,
          ruleId: rule.id,
          originalConditions,
          updatedConditions,
        };
      } catch (error) {
        logger.error("Failed to update rule conditions", { error, ruleName });
        return {
          success: false,
          error: "Failed to update rule conditions",
        };
      }
    },
  });

export type UpdateRuleConditionsTool = InferUITool<
  ReturnType<typeof updateRuleConditionsTool>
>;

export type UpdateRuleConditionsOutput = {
  success: boolean;
  ruleId?: string;
  error?: string;
  originalConditions?: {
    aiInstructions: string | null;
    static?: Record<string, string | null>;
    conditionalOperator: string | null;
  };
  updatedConditions?: {
    aiInstructions: string | null | undefined;
    static?: Record<string, string | null>;
    conditionalOperator: string | null | undefined;
  };
};
