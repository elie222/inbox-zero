import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { filterNullProperties } from "@/utils";
import { createRuleActionSchema } from "@/utils/ai/rule/create-rule-schema";
import { updateRuleActions } from "@/utils/rule/rule";
import { isMicrosoftProvider } from "@/utils/email/provider-types";
import { hideToolErrorFromUser } from "../../tool-error-visibility";
import type { RuleReadState } from "../../chat-rule-state";
import {
  buildHiddenRuleNotFoundError,
  trackRuleToolCall,
  validateRuleWasReadRecently,
} from "./shared";

export const updateRuleActionsTool = ({
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
      "Update the actions of an existing rule. This replaces the existing actions. SEND_EMAIL and FORWARD require an explicit recipient in fields.to; use REPLY for inbound auto-responses.",
    inputSchema: z.object({
      ruleName: z.string().describe("The name of the rule to update"),
      actions: z
        .array(createRuleActionSchema(provider))
        .min(1, "Rules must have at least one action.")
        .describe("The full replacement list of actions for the rule."),
    }),
    execute: async ({ ruleName, actions }) => {
      trackRuleToolCall({ tool: "update_rule_actions", email, logger });
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

        const originalActions = rule.actions.map((action) => ({
          type: action.type,
          fields: filterNullProperties({
            label: action.label,
            content: action.content,
            to: action.to,
            cc: action.cc,
            bcc: action.bcc,
            subject: action.subject,
            webhookUrl: action.url,
            ...(isMicrosoftProvider(provider) && {
              folderName: action.folderName,
            }),
          }),
          delayInMinutes: action.delayInMinutes,
        }));

        await updateRuleActions({
          ruleId: rule.id,
          actions: actions.map((action) => ({
            type: action.type,
            fields: {
              label: action.fields?.label ?? null,
              to: action.fields?.to ?? null,
              cc: action.fields?.cc ?? null,
              bcc: action.fields?.bcc ?? null,
              subject: action.fields?.subject ?? null,
              content: action.fields?.content ?? null,
              webhookUrl: action.fields?.webhookUrl ?? null,
              ...(isMicrosoftProvider(provider) && {
                folderName: action.fields?.folderName ?? null,
              }),
            },
            delayInMinutes: action.delayInMinutes ?? null,
          })),
          provider,
          emailAccountId,
          logger,
        });

        return {
          success: true,
          ruleId: rule.id,
          originalActions,
          updatedActions: actions,
        };
      } catch (error) {
        logger.error("Failed to update rule actions", { error, ruleName });
        return {
          success: false,
          error: "Failed to update rule actions",
        };
      }
    },
  });

export type UpdateRuleActionsTool = InferUITool<
  ReturnType<typeof updateRuleActionsTool>
>;

export type UpdateRuleActionsOutput = {
  success: boolean;
  ruleId?: string;
  error?: string;
  originalActions?: Array<{
    type: string;
    fields: Record<string, string | null>;
    delayInMinutes?: number | null;
  }>;
  updatedActions?: Array<{
    type: string;
    fields: Record<string, string | null>;
    delayInMinutes?: number | null;
  }>;
};
