import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { SystemType } from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { setRuleEnabled } from "@/utils/rule/rule";
import { hideToolErrorFromUser } from "../../tool-error-visibility";
import type { RuleReadState } from "../../chat-rule-state";
import { trackRuleToolCall, validateRuleWasReadRecently } from "./shared";

export const ruleStateOperationSchema = z.enum(["enable", "disable", "delete"]);

export const updateRuleStateTool = ({
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
      "Request deletion of an existing rule. Use updateRule with updates.enabled for enable, disable, pause, or resume. Delete requests return requiresConfirmation; explain that deletion is pending and no rule has been deleted until the user confirms in the UI. Default/system rules cannot be deleted; disable them instead.",
    inputSchema: z.object({
      ruleName: z.string().describe("The exact name of the rule to update"),
      operation: ruleStateOperationSchema.describe(
        "delete asks the user to confirm deleting the rule. Use updateRule for enable or disable.",
      ),
    }),
    execute: async ({ ruleName, operation }) => {
      trackRuleToolCall({ tool: "update_rule_state", email, logger });
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
            systemType: true,
            updatedAt: true,
            emailAccount: {
              select: {
                rulesRevision: true,
              },
            },
          },
        });

        if (!rule) {
          return {
            success: false,
            error:
              "Rule not found. Try listing the rules again. The user may have made changes since you last checked.",
          };
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

        if (operation === "delete") {
          if (rule.systemType) {
            return {
              success: false,
              error:
                "Default rules cannot be deleted. Disable the rule instead.",
              ruleId: rule.id,
              ruleName: rule.name,
              systemType: rule.systemType,
            };
          }

          return {
            success: true,
            actionType: "delete_rule" as const,
            requiresConfirmation: true as const,
            confirmationState: "pending" as const,
            ruleId: rule.id,
            ruleName: rule.name,
            wasEnabled: rule.enabled,
          };
        }

        const enabled = operation === "enable";
        if (rule.enabled !== enabled) {
          await setRuleEnabled({
            ruleId: rule.id,
            emailAccountId,
            enabled,
          });
        }

        return {
          success: true,
          ruleId: rule.id,
          ruleName: rule.name,
          operation,
          enabled,
          previousEnabled: rule.enabled,
        };
      } catch (error) {
        logger.error("Failed to update rule state", { error, ruleName });
        return {
          success: false,
          error: "Failed to update rule state",
        };
      }
    },
  });

export type UpdateRuleStateTool = InferUITool<
  ReturnType<typeof updateRuleStateTool>
>;

export type UpdateRuleStateOutput = {
  success: boolean;
  actionType?: "delete_rule";
  requiresConfirmation?: true;
  confirmationState?: "pending" | "processing" | "confirmed";
  ruleId?: string;
  ruleName?: string;
  operation?: z.infer<typeof ruleStateOperationSchema>;
  enabled?: boolean;
  previousEnabled?: boolean;
  wasEnabled?: boolean;
  systemType?: SystemType | null;
  error?: string;
};
