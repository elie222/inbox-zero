import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { SystemType } from "@/generated/prisma/enums";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { hideToolErrorFromUser } from "../../tool-error-visibility";
import type { RuleReadState } from "../../chat-rule-state";
import {
  buildHiddenRuleNotFoundError,
  buildVisibleOrgManagedRuleError,
  trackRuleToolCall,
  validateRuleWasReadRecently,
} from "./shared";

export const deleteRuleTool = ({
  email,
  emailAccountId,
  logger,
  getRuleReadState,
  markRuleDeletionPending,
}: {
  email: string;
  emailAccountId: string;
  logger: Logger;
  getRuleReadState?: () => RuleReadState | null;
  markRuleDeletionPending?: (ruleName: string) => void;
}) =>
  tool({
    description:
      "Request deletion of an existing custom rule after reading the user's current rules. Use this only with the exact rule name from getUserRulesAndSettings. Delete requests return requiresConfirmation; explain that deletion is pending and no rule has been deleted until the user confirms in the UI. Default/system rules cannot be deleted; disable them instead.",
    inputSchema: z.object({
      ruleName: z
        .string()
        .describe(
          "The exact name of the custom rule to delete, copied from getUserRulesAndSettings.",
        ),
    }),
    execute: async ({ ruleName }) => {
      trackRuleToolCall({ tool: "delete_rule", email, logger });
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
            organizationRuleId: true,
            updatedAt: true,
            emailAccount: {
              select: {
                rulesRevision: true,
              },
            },
          },
        });

        if (!rule) {
          return buildHiddenRuleNotFoundError();
        }

        if (rule.organizationRuleId) {
          return buildVisibleOrgManagedRuleError();
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

        if (rule.systemType) {
          return {
            success: false,
            error: "Default rules cannot be deleted. Disable the rule instead.",
            ruleId: rule.id,
            ruleName: rule.name,
            systemType: rule.systemType,
          };
        }

        markRuleDeletionPending?.(rule.name);

        return {
          success: true,
          actionType: "delete_rule" as const,
          requiresConfirmation: true as const,
          confirmationState: "pending" as const,
          ruleId: rule.id,
          ruleName: rule.name,
          wasEnabled: rule.enabled,
        };
      } catch (error) {
        logger.error("Failed to prepare rule deletion", { error, ruleName });
        return {
          success: false,
          error: "Failed to prepare rule deletion",
        };
      }
    },
  });

export type DeleteRuleTool = InferUITool<ReturnType<typeof deleteRuleTool>>;

export type DeleteRuleOutput = {
  success: boolean;
  actionType?: "delete_rule";
  requiresConfirmation?: true;
  confirmationState?: "pending" | "processing" | "confirmed";
  ruleId?: string;
  ruleName?: string;
  wasEnabled?: boolean;
  systemType?: SystemType | null;
  error?: string;
};
