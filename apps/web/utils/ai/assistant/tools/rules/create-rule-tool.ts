import { type InferUITool, tool } from "ai";
import type { Logger } from "@/utils/logger";
import { createRuleSchema } from "@/utils/ai/rule/create-rule-schema";
import {
  createRule,
  outboundActionsNeedChatRiskConfirmation,
} from "@/utils/rule/rule";
import {
  findSenderOnlyOverlapConflict,
  formatSenderOnlyOverlapError,
} from "@/utils/rule/sender-scope-overlap";
import {
  buildCreateRuleSchemaFromChatToolInput,
  trackRuleToolCall,
} from "./shared";

export const createRuleTool = ({
  email,
  emailAccountId,
  provider,
  logger,
}: {
  email: string;
  emailAccountId: string;
  provider: string;
  logger: Logger;
}) =>
  tool({
    description: "Create a new rule.",
    inputSchema: createRuleSchema(provider),
    execute: async ({ name, condition, actions }) => {
      trackRuleToolCall({ tool: "create_rule", email, logger });

      try {
        const overlapConflict = await findSenderOnlyOverlapConflict({
          emailAccountId,
          rule: {
            instructions: condition.aiInstructions,
            from: condition.static?.from,
            to: condition.static?.to,
            subject: condition.static?.subject,
          },
        });

        if (overlapConflict) {
          return {
            success: false,
            error: formatSenderOnlyOverlapError(overlapConflict),
            conflictingRuleName: overlapConflict.ruleName,
            overlappingSenders: overlapConflict.overlappingSenders,
          };
        }

        const resultPayload = buildCreateRuleSchemaFromChatToolInput(
          { name, condition, actions },
          provider,
        );

        const { needsConfirmation, riskMessages } =
          outboundActionsNeedChatRiskConfirmation(resultPayload);

        if (needsConfirmation) {
          return {
            success: true,
            actionType: "create_rule" as const,
            requiresConfirmation: true as const,
            confirmationState: "pending" as const,
            riskMessages,
          };
        }

        const rule = await createRule({
          result: resultPayload,
          emailAccountId,
          provider,
          runOnThreads: true,
          logger,
          enablement: { source: "chat" },
        });

        return { success: true, ruleId: rule.id };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        logger.error("Failed to create rule", { error });

        return { error: "Failed to create rule", message };
      }
    },
  });

export type CreateRuleTool = InferUITool<ReturnType<typeof createRuleTool>>;
