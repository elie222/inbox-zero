import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import prisma from "@/utils/prisma";
import { GroupItemType } from "@/generated/prisma/enums";
import { saveLearnedPatterns } from "@/utils/rule/learned-patterns";
import { hideToolErrorFromUser } from "../../tool-error-visibility";
import type { RuleReadState } from "../../chat-rule-state";
import {
  buildHiddenRuleNotFoundError,
  trackRuleToolCall,
  validateRuleWasReadRecently,
} from "./shared";

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
    description:
      "Update the learned patterns of an existing inbox rule after you have identified the exact rule to change. Use when an existing category rule already fits and the user wants recurring senders added or removed, instead of creating a new rule or editing static from/to fields. If a recurring sender should move from one rule to another, update both rules with learned-pattern includes and excludes.",
    inputSchema: z.object({
      ruleName: z.string().describe("The name of the rule to update"),
      learnedPatterns: z
        .array(
          z
            .object({
              include: z
                .object({
                  from: z
                    .string()
                    .nullish()
                    .describe("Sender pattern to include in the rule."),
                  subject: z
                    .string()
                    .nullish()
                    .describe("Subject pattern to include in the rule."),
                })
                .describe("Patterns that should match the rule.")
                .nullish(),
              exclude: z
                .object({
                  from: z
                    .string()
                    .nullish()
                    .describe("Sender pattern to exclude from the rule."),
                  subject: z
                    .string()
                    .nullish()
                    .describe("Subject pattern to exclude from the rule."),
                })
                .describe("Patterns that should not match the rule.")
                .nullish(),
            })
            .describe("One learned-pattern update entry."),
        )
        .describe("Learned sender and subject patterns to save for the rule.")
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
          const result = await saveLearnedPatterns({
            emailAccountId,
            ruleName: rule.name,
            patterns: patternsToSave,
            logger,
          });

          if (result?.error) {
            return {
              success: false,
              error: result.error,
            };
          }
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
