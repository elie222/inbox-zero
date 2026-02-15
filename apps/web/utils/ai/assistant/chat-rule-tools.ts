import { type InferUITool, tool } from "ai";
import { z } from "zod";
import type { Logger } from "@/utils/logger";
import { createRuleSchema } from "@/utils/ai/rule/create-rule-schema";
import prisma from "@/utils/prisma";
import { isDuplicateError } from "@/utils/prisma-helpers";
import {
  createRule,
  partialUpdateRule,
  updateRuleActions,
} from "@/utils/rule/rule";
import {
  ActionType,
  GroupItemType,
  LogicalOperator,
} from "@/generated/prisma/enums";
import { saveLearnedPatterns } from "@/utils/rule/learned-patterns";
import { posthogCaptureEvent } from "@/utils/posthog";
import { filterNullProperties } from "@/utils";
import {
  delayInMinutesSchema,
  updateRuleConditionSchema,
} from "@/utils/actions/rule.validation";
import { isMicrosoftProvider } from "@/utils/email/provider-types";

const emptyInputSchema = z.object({}).describe("No parameters required");

type GetUserRulesAndSettingsOutput = {
  about: string;
  rules:
    | Array<{
        name: string;
        conditions: {
          aiInstructions: string | null;
          static?: Partial<{
            from: string | null;
            to: string | null;
            subject: string | null;
          }>;
          conditionalOperator?: LogicalOperator;
        };
        actions: Array<{
          type: ActionType;
          fields: Partial<{
            label: string | null;
            content: string | null;
            to: string | null;
            cc: string | null;
            bcc: string | null;
            subject: string | null;
            webhookUrl: string | null;
            folderName: string | null;
          }>;
        }>;
        enabled: boolean;
        runOnThreads: boolean;
      }>
    | undefined;
};

const RULE_READ_FRESHNESS_WINDOW_MS = 2 * 60 * 1000;

export type RuleReadState = {
  readAt: number;
  ruleUpdatedAtByName: Map<string, string>;
};

// tools
export const getUserRulesAndSettingsTool = ({
  email,
  emailAccountId,
  logger,
  setRuleReadState,
}: {
  email: string;
  emailAccountId: string;
  logger: Logger;
  setRuleReadState?: (state: RuleReadState) => void;
}) =>
  tool<z.infer<typeof emptyInputSchema>, GetUserRulesAndSettingsOutput>({
    description:
      "Retrieve all existing rules for the user, and their about information. Always call this immediately before updating any existing rule.",
    inputSchema: emptyInputSchema,
    execute: async (_input: z.infer<typeof emptyInputSchema>) => {
      trackToolCall({
        tool: "get_user_rules_and_settings",
        email,
        logger,
      });

      const emailAccount = await prisma.emailAccount.findUnique({
        where: { id: emailAccountId },
        select: {
          about: true,
          rules: {
            select: {
              name: true,
              instructions: true,
              updatedAt: true,
              from: true,
              to: true,
              subject: true,
              conditionalOperator: true,
              enabled: true,
              runOnThreads: true,
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
                },
              },
            },
          },
        },
      });

      setRuleReadState?.({
        readAt: Date.now(),
        ruleUpdatedAtByName: new Map(
          (emailAccount?.rules || []).map((rule) => [
            rule.name,
            rule.updatedAt.toISOString(),
          ]),
        ),
      });

      return {
        about: emailAccount?.about || "Not set",
        rules: emailAccount?.rules.map((rule) => {
          const staticFilter = filterNullProperties({
            from: rule.from,
            to: rule.to,
            subject: rule.subject,
          });

          const staticConditions =
            Object.keys(staticFilter).length > 0 ? staticFilter : undefined;

          return {
            name: rule.name,
            conditions: {
              aiInstructions: rule.instructions,
              static: staticConditions,
              // only need to show conditional operator if there are multiple conditions
              conditionalOperator:
                rule.instructions && staticConditions
                  ? rule.conditionalOperator
                  : undefined,
            },
            actions: rule.actions.map((action) => ({
              type: action.type,
              fields: filterNullProperties({
                label: action.label,
                content: action.content,
                to: action.to,
                cc: action.cc,
                bcc: action.bcc,
                subject: action.subject,
                webhookUrl: action.url,
                folderName: action.folderName,
              }),
            })),
            enabled: rule.enabled,
            runOnThreads: rule.runOnThreads,
          };
        }),
      };
    },
  });

export type GetUserRulesAndSettingsTool = InferUITool<
  ReturnType<typeof getUserRulesAndSettingsTool>
>;

export const getLearnedPatternsTool = ({
  email,
  emailAccountId,
  logger,
}: {
  email: string;
  emailAccountId: string;
  logger: Logger;
}) =>
  tool({
    description: "Retrieve the learned patterns for a rule",
    inputSchema: z.object({
      ruleName: z
        .string()
        .describe("The name of the rule to get the learned patterns for"),
    }),
    execute: async ({ ruleName }) => {
      trackToolCall({ tool: "get_learned_patterns", email, logger });

      const rule = await prisma.rule.findUnique({
        where: { name_emailAccountId: { name: ruleName, emailAccountId } },
        select: {
          group: {
            select: {
              items: {
                select: {
                  type: true,
                  value: true,
                  exclude: true,
                },
              },
            },
          },
        },
      });

      if (!rule) {
        return {
          error:
            "Rule not found. Try listing the rules again. The user may have made changes since you last checked.",
        };
      }

      return {
        patterns: rule.group?.items,
      };
    },
  });

export type GetLearnedPatternsTool = InferUITool<
  ReturnType<typeof getLearnedPatternsTool>
>;

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
    description: "Create a new rule",
    inputSchema: createRuleSchema(provider),
    execute: async ({ name, condition, actions }) => {
      trackToolCall({ tool: "create_rule", email, logger });

      try {
        const rule = await createRule({
          result: {
            name,
            condition,
            actions: actions.map((action) => ({
              type: action.type,
              fields: action.fields
                ? {
                    content: action.fields.content ?? null,
                    to: action.fields.to ?? null,
                    subject: action.fields.subject ?? null,
                    label: action.fields.label ?? null,
                    webhookUrl: action.fields.webhookUrl ?? null,
                    cc: action.fields.cc ?? null,
                    bcc: action.fields.bcc ?? null,
                    ...(isMicrosoftProvider(provider) && {
                      folderName: action.fields.folderName ?? null,
                    }),
                  }
                : null,
              delayInMinutes: null,
            })),
          },
          emailAccountId,
          provider,
          runOnThreads: true,
          logger,
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
export type UpdateRuleConditionSchema = z.infer<
  typeof updateRuleConditionSchema
>;

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
      "Update the conditions of an existing rule. Requires a fresh getUserRulesAndSettings call in the current request before writing.",
    inputSchema: updateRuleConditionSchema,
    execute: async ({ ruleName, condition }) => {
      trackToolCall({ tool: "update_rule_conditions", email, logger });

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
          instructions: true,
          from: true,
          to: true,
          subject: true,
          conditionalOperator: true,
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
        currentRuleUpdatedAt: rule.updatedAt,
      });
      if (staleReadError) {
        return {
          success: false,
          error: staleReadError,
        };
      }

      // Store original state
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
        data: {
          instructions: condition.aiInstructions,
          from: condition.static?.from,
          to: condition.static?.to,
          subject: condition.static?.subject,
          conditionalOperator: condition.conditionalOperator ?? undefined,
        },
      });

      // Prepare updated state
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
      "Update the actions of an existing rule. This replaces the existing actions.",
    inputSchema: z.object({
      ruleName: z.string().describe("The name of the rule to update"),
      actions: z.array(
        z.object({
          type: z.enum([
            ActionType.ARCHIVE,
            ActionType.LABEL,
            ActionType.MOVE_FOLDER,
            ActionType.DRAFT_EMAIL,
            ActionType.FORWARD,
            ActionType.REPLY,
            ActionType.SEND_EMAIL,
            ActionType.MARK_READ,
            ActionType.MARK_SPAM,
            ActionType.CALL_WEBHOOK,
            ActionType.DIGEST,
          ]),
          fields: z.object({
            label: z.string().nullish(),
            content: z.string().nullish(),
            webhookUrl: z.string().nullish(),
            to: z.string().nullish(),
            cc: z.string().nullish(),
            bcc: z.string().nullish(),
            subject: z.string().nullish(),
            folderName: z.string().nullish(),
          }),
          delayInMinutes: delayInMinutesSchema,
        }),
      ),
    }),
    execute: async ({ ruleName, actions }) => {
      trackToolCall({ tool: "update_rule_actions", email, logger });

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
        currentRuleUpdatedAt: rule.updatedAt,
      });
      if (staleReadError) {
        return {
          success: false,
          error: staleReadError,
        };
      }

      // Store original actions
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
  }>;
  updatedActions?: Array<{
    type: string;
    fields: Record<string, string | null>;
    delayInMinutes?: number | null;
  }>;
};

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
    description: "Update the learned patterns of an existing rule",
    inputSchema: z.object({
      ruleName: z.string().describe("The name of the rule to update"),
      learnedPatterns: z
        .array(
          z.object({
            include: z
              .object({
                from: z.string().optional(),
                subject: z.string().optional(),
              })
              .optional(),
            exclude: z
              .object({
                from: z.string().optional(),
                subject: z.string().optional(),
              })
              .optional(),
          }),
        )
        .min(1, "At least one learned pattern is required"),
    }),
    execute: async ({ ruleName, learnedPatterns }) => {
      trackToolCall({ tool: "update_learned_patterns", email, logger });

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
        select: { id: true, name: true, updatedAt: true },
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
        currentRuleUpdatedAt: rule.updatedAt,
      });
      if (staleReadError) {
        return {
          success: false,
          error: staleReadError,
        };
      }

      // Convert the learned patterns format
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
    },
  });

export type UpdateLearnedPatternsTool = InferUITool<
  ReturnType<typeof updateLearnedPatternsTool>
>;

export const updateAboutTool = ({
  email,
  emailAccountId,
  logger,
}: {
  email: string;
  emailAccountId: string;
  logger: Logger;
}) =>
  tool({
    description:
      "Update the user's personal instructions (about). Use mode 'append' to add a new preference without losing existing content. Use mode 'replace' to overwrite entirely (read existing content first).",
    inputSchema: z.object({
      about: z.string(),
      mode: z
        .enum(["replace", "append"])
        .default("replace")
        .describe(
          "Use 'append' to add to existing instructions, 'replace' to overwrite entirely.",
        ),
    }),
    execute: async ({ about, mode }) => {
      trackToolCall({ tool: "update_about", email, logger });
      const existing = await prisma.emailAccount.findUnique({
        where: { id: emailAccountId },
        select: { about: true },
      });

      if (!existing) return { error: "Account not found" };

      const updatedAbout =
        mode === "append" && existing.about
          ? `${existing.about}\n${about}`
          : about;

      await prisma.emailAccount.update({
        where: { id: emailAccountId },
        data: { about: updatedAbout },
      });

      return {
        success: true,
        previousAbout: existing.about,
        updatedAbout,
      };
    },
  });

export type UpdateAboutTool = InferUITool<ReturnType<typeof updateAboutTool>>;

export const addToKnowledgeBaseTool = ({
  email,
  emailAccountId,
  logger,
}: {
  email: string;
  emailAccountId: string;
  logger: Logger;
}) =>
  tool({
    description: "Add content to the knowledge base",
    inputSchema: z.object({
      title: z.string(),
      content: z.string(),
    }),
    execute: async ({ title, content }) => {
      trackToolCall({ tool: "add_to_knowledge_base", email, logger });

      try {
        await prisma.knowledge.create({
          data: {
            emailAccountId,
            title,
            content,
          },
        });

        return { success: true };
      } catch (error) {
        if (isDuplicateError(error, "title")) {
          return {
            error: "A knowledge item with this title already exists",
          };
        }

        logger.error("Failed to add to knowledge base", { error });
        return { error: "Failed to add to knowledge base" };
      }
    },
  });

export type AddToKnowledgeBaseTool = InferUITool<
  ReturnType<typeof addToKnowledgeBaseTool>
>;

async function trackToolCall({
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

function validateRuleWasReadRecently({
  ruleName,
  getRuleReadState,
  currentRuleUpdatedAt,
}: {
  ruleName: string;
  getRuleReadState?: () => RuleReadState | null;
  currentRuleUpdatedAt?: Date;
}) {
  const ruleReadState = getRuleReadState?.() || null;

  if (!ruleReadState) {
    return "Before updating an existing rule, call getUserRulesAndSettings immediately beforehand.";
  }

  if (Date.now() - ruleReadState.readAt > RULE_READ_FRESHNESS_WINDOW_MS) {
    return "Rules may be stale. Call getUserRulesAndSettings again immediately before updating the rule.";
  }

  if (!currentRuleUpdatedAt) return null;

  const lastReadRuleUpdatedAt =
    ruleReadState.ruleUpdatedAtByName.get(ruleName) || null;

  if (!lastReadRuleUpdatedAt) {
    return "Rule details are stale or missing. Call getUserRulesAndSettings again before updating this rule.";
  }

  if (lastReadRuleUpdatedAt !== currentRuleUpdatedAt.toISOString()) {
    return "Rule changed since the last read. Call getUserRulesAndSettings again, then apply the update.";
  }

  return null;
}
