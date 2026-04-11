import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { GroupItemType } from "@/generated/prisma/enums";
import { saveLearnedPatterns } from "@/utils/rule/learned-patterns";
import type { RuleReadState } from "../../chat-rule-state";
import { trackRuleToolCall, validateRuleWasReadRecently } from "./shared";

export const updateLearnedPatternsTool = ({
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
    description: "Update the learned patterns of an existing rule.",
    inputSchema: z.object({
      ruleName: z.string().describe("The name of the rule to update"),
      learnedPatterns: z
        .array(
          z.object({
            include: z
              .object({
                from: z.string().nullish(),
                subject: z.string().nullish(),
              })
              .nullish(),
            exclude: z
              .object({
                from: z.string().nullish(),
                subject: z.string().nullish(),
              })
              .nullish(),
          }),
        )
        .min(1, "At least one learned pattern is required"),
    }),
    execute: async ({ ruleName, learnedPatterns }) => {
      trackRuleToolCall({ tool: "update_learned_patterns", email, logger });
      try {
        const readValidationError = validateRuleWasReadRecently({
          ruleName,
          getRuleReadState,
        });

        if (readValidationError) {
          return {
            success: false,
            error: readValidationError,
          };
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
          return {
            success: false,
            error: staleReadError,
          };
        }

        const patternsToSave: Array<{
          type: GroupItemType;
          value: string;
          exclude?: boolean;
        }> = [];

        for (const pattern of learnedPatterns) {
          if (pattern.include?.from) {
            patternsToSave.push({
              type: GroupItemType.FROM,
              value: pattern.include.from,
              exclude: false,
            });
          }

          if (pattern.include?.subject) {
            patternsToSave.push({
              type: GroupItemType.SUBJECT,
              value: pattern.include.subject,
              exclude: false,
            });
          }

          if (pattern.exclude?.from) {
            patternsToSave.push({
              type: GroupItemType.FROM,
              value: pattern.exclude.from,
              exclude: true,
            });
          }

          if (pattern.exclude?.subject) {
            patternsToSave.push({
              type: GroupItemType.SUBJECT,
              value: pattern.exclude.subject,
              exclude: true,
            });
          }
        }

        if (patternsToSave.length > 0) {
          await saveLearnedPatterns({
            emailAccountId,
            ruleName: rule.name,
            patterns: patternsToSave,
            logger,
          });
        }

        return { success: true, ruleId: rule.id };
      } catch (error) {
        logger.error("Failed to update learned patterns", { error, ruleName });
        return {
          success: false,
          error: "Failed to update learned patterns",
        };
      }
    },
  });

export type UpdateLearnedPatternsTool = InferUITool<
  ReturnType<typeof updateLearnedPatternsTool>
>;
