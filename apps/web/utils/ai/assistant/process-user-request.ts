import { tool } from "ai";
import { z } from "zod";
import { after } from "next/server";
import { chatCompletionTools } from "@/utils/llms";
import { createScopedLogger } from "@/utils/logger";
import {
  type Category,
  GroupItemType,
  LogicalOperator,
  type Rule,
} from "@prisma/client";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { RuleWithRelations } from "@/utils/ai/rule/create-prompt-from-rule";
import { isDefined, type ParsedMessage } from "@/utils/types";
import {
  createRuleSchema,
  type CreateRuleSchemaWithCategories,
  getCreateRuleSchemaWithCategories,
} from "@/utils/ai/rule/create-rule-schema";
import { deleteGroupItem } from "@/utils/group/group-item";
import {
  addRuleCategories,
  createRule,
  partialUpdateRule,
  removeRuleCategories,
} from "@/utils/rule/rule";
import { updateCategoryForSender } from "@/utils/categorize/senders/categorize";
import { findSenderByEmail } from "@/utils/sender";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { stringifyEmailSimple } from "@/utils/stringify-email";
import {
  updatePromptFileOnRuleCreated,
  updatePromptFileOnRuleUpdated,
} from "@/utils/rule/prompt-file";
import { env } from "@/env";
import { posthogCaptureEvent } from "@/utils/posthog";
import { getUserCategoriesForNames } from "@/utils/category.server";

const logger = createScopedLogger("ai-fix-rules");

export async function processUserRequest({
  emailAccount,
  rules,
  originalEmail,
  messages,
  matchedRule,
  categories,
  senderCategory,
}: {
  emailAccount: EmailAccountWithAI;
  rules: RuleWithRelations[];
  originalEmail: ParsedMessage | null;
  messages: { role: "assistant" | "user"; content: string }[];
  matchedRule: RuleWithRelations | null;
  categories: Pick<Category, "id" | "name">[] | null;
  senderCategory: string | null;
}) {
  posthogCaptureEvent(emailAccount.email, "AI Assistant Process Started", {
    hasOriginalEmail: !!originalEmail,
    hasMatchedRule: !!matchedRule,
  });

  if (messages[messages.length - 1].role === "assistant")
    throw new Error("Assistant message cannot be last");

  const userRules = rulesToXML(rules);

  const system = `You are an email management assistant that helps users manage their email rules.
You can fix rules using these specific operations:

1. Edit Rule Components:
- Change conditional operator (AND/OR logic)
- Modify AI instructions
- Update static conditions (from, to, subject, body)
- Add or remove categories

2. Create New Rules:
- Create new rules when asked or when existing ones cannot be modified to fit the need
- In general, you should NOT create new rules. Modify existing ones instead. If a user asked to exclude something from an existing rule, that's not a request to create a new rule, but to edit the existing rule.

${
  matchedRule?.group?.items?.length
    ? `3. Manage Learned Patterns:
- These are patterns that have been learned from the user's email history to always be matched (and they ignore the conditionalOperator setting)
- Patterns are email addresses or subjects
- You can remove patterns`
    : ""
}

When fixing rules:
- Make one precise change at a time
- Prefer minimal changes that solve the problem
- Keep rules general and maintainable

Rule matching logic:
- All static conditions (from, to, subject, body) use AND logic - meaning all static conditions must match
- Top level conditions (AI instructions, static, category) can use either AND or OR logic, controlled by the conditionalOperator setting

Best practices:
- For static conditions, use email patterns (e.g., '@company.com') when matching multiple addresses
- IMPORTANT: do not create new rules unless absolutely necessary. Avoid duplicate rules, so make sure to check if the rule already exists.
- You can use multiple conditions in a rule, but aim for simplicity.
- When creating rules, in most cases, you should use the "aiInstructions" and sometimes you will use other fields in addition.
- If a rule can be handled fully with static conditions, do so, but this is rarely possible.

Always end by using the reply tool to explain what changes were made.
Use simple language and avoid jargon in your reply.
When you've made updates, include a link to the rules page at the end of your reply: ${env.NEXT_PUBLIC_BASE_URL}/automation?tab=rules
If you are unable to fix the rule, say so.`;

  const prompt = `${
    originalEmail
      ? `<matched_rule>
${matchedRule ? ruleToXML(matchedRule) : "No rule matched"}
</matched_rule>`
      : ""
  }

${!matchedRule ? userRules : ""}

${
  emailAccount.about
    ? `<user_about>
  ${emailAccount.about}
</user_about>`
    : ""
}

${
  originalEmail
    ? `<original_email>
${stringifyEmailSimple(getEmailForLLM(originalEmail))}
</original_email>`
    : ""
}

${
  originalEmail && categories?.length
    ? `<sender_category>
${senderCategory || "No category"}
</sender_category>`
    : ""
}`;

  const allMessages = [
    {
      role: "system" as const,
      content: system,
    },
    {
      role: "user" as const,
      content: prompt,
    },
    ...(messages || []),
  ];

  logger.trace("Input", { allMessages });

  const createdRules = new Map<string, RuleWithRelations>();
  const updatedRules = new Map<string, RuleWithRelations>();

  const loggerOptions = {
    emailAccountId: emailAccount.id,
    userId: emailAccount.userId,
    email: emailAccount.email,
    messageId: originalEmail?.id,
    threadId: originalEmail?.threadId,
  };

  async function updateRule(ruleName: string, rule: Partial<Rule>) {
    try {
      const ruleId = rules.find((r) => r.name === ruleName)?.id;

      if (!ruleId) {
        return {
          error: "Rule not found",
          message: `Rule ${ruleName} not found`,
        };
      }

      const updatedRule = await partialUpdateRule({ ruleId, data: rule });
      updatedRules.set(updatedRule.id, updatedRule);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      logger.error("Error while updating rule", {
        ...loggerOptions,
        ruleName,
        keys: Object.keys(rule),
        error: message,
      });

      return {
        error: "Failed to update rule",
        message,
      };
    }
  }

  const result = await chatCompletionTools({
    userAi: emailAccount.user,
    messages: allMessages,
    tools: {
      update_conditional_operator: tool({
        description: "Update the conditional operator of a rule",
        parameters: z.object({
          ruleName: z.string().describe("The exact name of the rule to edit"),
          conditionalOperator: z
            .enum([LogicalOperator.AND, LogicalOperator.OR])
            .describe("The new conditional operator"),
        }),
        execute: async ({ ruleName, conditionalOperator }) => {
          logger.info("Edit Conditional Operator", {
            ruleName,
            conditionalOperator,
          });
          trackToolCall({
            tool: "update_conditional_operator",
            email: emailAccount.email,
          });

          return updateRule(ruleName, { conditionalOperator });
        },
      }),
      update_ai_instructions: tool({
        description: "Update the AI instructions of a rule",
        parameters: z.object({
          ruleName: z.string().describe("The exact name of the rule to edit"),
          aiInstructions: z.string().describe("The new AI instructions"),
        }),
        execute: async ({ ruleName, aiInstructions }) => {
          logger.info("Edit AI Instructions", { ruleName, aiInstructions });
          trackToolCall({
            tool: "update_ai_instructions",
            email: emailAccount.email,
          });

          return updateRule(ruleName, { instructions: aiInstructions });
        },
      }),
      update_static_conditions: tool({
        description: "Update the static conditions of a rule",
        parameters: z.object({
          ruleName: z.string().describe("The exact name of the rule to edit"),
          staticConditions: createRuleSchema.shape.condition.shape.static,
        }),
        execute: async ({ ruleName, staticConditions }) => {
          logger.info("Edit Static Conditions", { ruleName, staticConditions });
          trackToolCall({
            tool: "update_static_conditions",
            email: emailAccount.email,
          });

          return updateRule(ruleName, {
            from: staticConditions?.from,
            to: staticConditions?.to,
            subject: staticConditions?.subject,
          });
        },
      }),
      // We may bring this back as "learned patterns"
      // add_pattern: tool({
      //   description: "Add a pattern",
      //   parameters: z.object({
      //     ruleName: z
      //       .string()
      //       .describe("The name of the rule to add the pattern to"),
      //     type: z
      //       .enum(["from", "subject"])
      //       .describe("The type of the pattern to add"),
      //     value: z
      //       .string()
      //       .describe(
      //         "The value of the pattern to add. e.g. '@company.com', 'matt@company.com', 'Receipt from'",
      //       ),
      //   }),
      //   execute: async ({ ruleName, type, value }) => {
      //     logger.info("Add To Learned Patterns", { ruleName, type, value });

      //     const group = rules.find((r) => r.group?.name === groupName)?.group;
      //     const groupId = group?.id;

      //     if (!groupId) {
      //       logger.error("Group not found", {
      //         ...loggerOptions,
      //         groupName,
      //       });
      //       return { error: "Group not found" };
      //     }

      //     const groupItemType = getPatternType(type);

      //     if (!groupItemType) {
      //       logger.error("Invalid pattern type", {
      //         ...loggerOptions,
      //         type,
      //       });
      //       return { error: "Invalid pattern type" };
      //     }

      //     try {
      //       await addGroupItem({ groupId, type: groupItemType, value });
      //     } catch (error) {
      //       const message =
      //         error instanceof Error ? error.message : String(error);

      //       logger.error("Error while adding pattern", {
      //         ...loggerOptions,
      //         groupId,
      //         type: groupItemType,
      //         value,
      //         error: message,
      //       });
      //       return {
      //         error: "Failed to add pattern",
      //         message,
      //       };
      //     }

      //     return { success: true };
      //   },
      // }),
      ...(matchedRule?.group
        ? {
            remove_pattern: tool({
              description: "Remove a pattern",
              parameters: z.object({
                type: z
                  .enum(["from", "subject"])
                  .describe("The type of the pattern to remove"),
                value: z
                  .string()
                  .describe("The value of the pattern to remove"),
              }),
              execute: async ({ type, value }) => {
                logger.info("Remove Pattern", { type, value });
                trackToolCall({
                  tool: "remove_pattern",
                  email: emailAccount.email,
                });

                const groupItemType = getPatternType(type);

                if (!groupItemType) {
                  logger.error("Invalid pattern type", {
                    ...loggerOptions,
                    type,
                    value,
                  });
                  return { error: "Invalid pattern type" };
                }

                const groupItem = matchedRule?.group?.items?.find(
                  (item) => item.type === groupItemType && item.value === value,
                );

                if (!groupItem) {
                  logger.error("Pattern not found", {
                    ...loggerOptions,
                    type,
                    value,
                  });
                  return { error: "Pattern not found" };
                }

                try {
                  await deleteGroupItem({
                    id: groupItem.id,
                    emailAccountId: emailAccount.id,
                  });
                } catch (error) {
                  const message =
                    error instanceof Error ? error.message : String(error);

                  logger.error("Error while deleting pattern", {
                    ...loggerOptions,
                    groupItemId: groupItem.id,
                    type: groupItemType,
                    value,
                    error: message,
                  });

                  return {
                    error: "Failed to delete pattern",
                    message,
                  };
                }

                return { success: true };
              },
            }),
          }
        : {}),
      ...(categories
        ? {
            update_sender_category: getUpdateCategoryTool({
              emailAccountId: emailAccount.id,
              userEmail: emailAccount.email,
              categories,
              loggerOptions,
            }),
            add_categories: tool({
              description: "Add categories to a rule",
              parameters: z.object({
                ruleName: z
                  .string()
                  .describe("The exact name of the rule to edit"),
                categories: z
                  .array(z.string())
                  .describe("The categories to add"),
              }),
              execute: async (options) => {
                try {
                  logger.info("Add Rule Categories", options);
                  trackToolCall({
                    tool: "add_categories",
                    email: emailAccount.email,
                  });

                  const { ruleName } = options;

                  const rule = rules.find((r) => r.name === ruleName);

                  if (!rule) {
                    logger.error("Rule not found", {
                      ...loggerOptions,
                      ...options,
                      ruleName,
                    });
                    return { error: "Rule not found" };
                  }

                  const categoryIds = options.categories
                    .map((c) => categories.find((cat) => cat.name === c))
                    .filter(isDefined)
                    .map((c) => c.id);

                  const updatedRule = await addRuleCategories(
                    rule.id,
                    categoryIds,
                  );

                  updatedRules.set(updatedRule.id, updatedRule);

                  return { success: true };
                } catch (error) {
                  const message =
                    error instanceof Error ? error.message : String(error);

                  logger.error("Error while adding categories to rule", {
                    ...loggerOptions,
                    ...options,
                    error: message,
                  });

                  return {
                    error: "Failed to add categories to rule",
                    message,
                  };
                }
              },
            }),
            remove_categories: tool({
              description: "Remove categories from a rule",
              parameters: z.object({
                ruleName: z
                  .string()
                  .describe("The exact name of the rule to edit"),
                categories: z
                  .array(z.string())
                  .describe("The categories to remove"),
              }),
              execute: async (options) => {
                try {
                  logger.info("Remove Rule Categories", options);
                  trackToolCall({
                    tool: "remove_categories",
                    email: emailAccount.email,
                  });

                  const { ruleName } = options;

                  const rule = rules.find((r) => r.name === ruleName);

                  if (!rule) {
                    logger.error("Rule not found", {
                      ...loggerOptions,
                      ...options,
                      ruleName,
                    });
                    return { error: "Rule not found" };
                  }

                  const categoryIds = options.categories
                    .map((c) => categories.find((cat) => cat.name === c))
                    .filter(isDefined)
                    .map((c) => c.id);

                  const updatedRule = await removeRuleCategories(
                    rule.id,
                    categoryIds,
                  );

                  updatedRules.set(updatedRule.id, updatedRule);

                  return { success: true };
                } catch (error) {
                  const message =
                    error instanceof Error ? error.message : String(error);

                  logger.error("Error while removing categories from rule", {
                    ...loggerOptions,
                    ...options,
                    error: message,
                  });

                  return {
                    error: "Failed to remove categories from rule",
                    message,
                  };
                }
              },
            }),
          }
        : {}),
      create_rule: tool({
        description: "Create a new rule",
        parameters: categories
          ? getCreateRuleSchemaWithCategories(
              categories.map((c) => c.name) as [string, ...string[]],
            )
          : createRuleSchema,
        execute: async ({ name, condition, actions }) => {
          logger.info("Create Rule", { name, condition, actions });
          trackToolCall({
            tool: "create_rule",
            email: emailAccount.email,
          });

          const conditions =
            condition as CreateRuleSchemaWithCategories["condition"];

          try {
            const categoryIds = await getUserCategoriesForNames({
              emailAccountId: emailAccount.id,
              names: conditions.categories?.categoryFilters || [],
            });

            const rule = await createRule({
              result: { name, condition, actions },
              emailAccountId: emailAccount.id,
              categoryIds,
            });

            if ("error" in rule) {
              logger.error("Error while creating rule", {
                ...loggerOptions,
                error: rule.error,
              });

              return {
                error: "Failed to create rule",
                message: rule.error,
              };
            }

            createdRules.set(rule.id, rule);

            return { success: true };
          } catch (error) {
            const message =
              error instanceof Error ? error.message : String(error);

            logger.error("Failed to create rule", {
              ...loggerOptions,
              error: message,
            });

            return {
              error: "Failed to create rule",
              message,
            };
          }
        },
      }),
      list_rules: tool({
        description: "List all existing rules for the user",
        parameters: z.object({}),
        execute: async () => {
          trackToolCall({
            tool: "list_rules",
            email: emailAccount.email,
          });
          return userRules;
        },
      }),
      reply: tool({
        description: "Send an email reply to the user",
        parameters: z.object({
          content: z.string().describe("The content of the reply"),
        }),
        // no execute function - invoking it will terminate the agent
      }),
    },
    maxSteps: 5,
    label: "Fix Rule",
    userEmail: emailAccount.email,
  });

  const toolCalls = result.steps.flatMap((step) => step.toolCalls);

  logger.trace("Tool Calls", { toolCalls });

  // Upon completion, check what changes were made and make sure the prompt file is updated

  // Update prompt file for newly created rules
  after(async () => {
    for (const rule of createdRules.values()) {
      await updatePromptFileOnRuleCreated({
        emailAccountId: emailAccount.id,
        rule,
      });
    }
  });

  // Update prompt file for modified rules
  for (const updatedRule of updatedRules.values()) {
    // Find the original rule state from the initial rules array
    const originalRule = rules.find((r) => r.id === updatedRule.id);

    if (!originalRule) {
      logger.error(
        "Original rule not found when updating prompt file for modified rule",
        {
          ...loggerOptions,
          updatedRuleId: updatedRule.id,
        },
      );
      continue; // Skip if original rule not found (should not happen ideally)
    }

    after(async () => {
      await updatePromptFileOnRuleUpdated({
        emailAccountId: emailAccount.id,
        currentRule: originalRule,
        updatedRule: updatedRule,
      });
    });
  }

  posthogCaptureEvent(emailAccount.email, "AI Assistant Process Completed", {
    toolCallCount: result.steps.length,
    rulesCreated: createdRules.size,
    rulesUpdated: updatedRules.size,
  });

  return result;
}

const getUpdateCategoryTool = ({
  emailAccountId,
  categories,
  loggerOptions,
  userEmail,
}: {
  emailAccountId: string;
  categories: Pick<Category, "id" | "name">[];
  loggerOptions: {
    userId: string;
    email: string | null;
    messageId?: string | null;
    threadId?: string | null;
  };
  userEmail: string;
}) =>
  tool({
    description: "Update the category of a sender",
    parameters: z.object({
      sender: z.string().describe("The sender to update"),
      category: z
        .enum([
          ...(categories.map((c) => c.name) as [string, ...string[]]),
          "none",
        ])
        .describe("The name of the category to assign"),
    }),
    execute: async ({ sender, category }) => {
      logger.info("Update Category", { sender, category });
      trackToolCall({
        tool: "update_sender_category",
        email: userEmail,
      });

      const existingSender = await findSenderByEmail({
        emailAccountId,
        email: sender,
      });

      const cat = categories.find((c) => c.name === category);

      if (!cat) {
        logger.error("Category not found", {
          ...loggerOptions,
          category,
        });
        return { error: "Category not found" };
      }

      try {
        await updateCategoryForSender({
          emailAccountId,
          sender: existingSender?.email || sender,
          categoryId: cat.id,
        });
        return { success: true };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        logger.error("Error while updating category for sender", {
          ...loggerOptions,
          sender,
          category,
          error: message,
        });
        return {
          error: "Failed to update category for sender",
          message,
        };
      }
    },
  });

function ruleToXML(rule: RuleWithRelations) {
  return `<rule>
  <rule_name>${rule.name}</rule_name>
  <conditions>
    <conditional_operator>${rule.conditionalOperator}</conditional_operator>
    ${rule.instructions ? `<ai_instructions>${rule.instructions}</ai_instructions>` : ""}
    ${
      hasStaticConditions(rule)
        ? `<static_conditions>
      ${rule.from ? `<from>${rule.from}</from>` : ""}
      ${rule.to ? `<to>${rule.to}</to>` : ""}
      ${rule.subject ? `<subject>${rule.subject}</subject>` : ""}
      ${rule.body ? `<body>${rule.body}</body>` : ""}
    </static_conditions>`
        : ""
    }
    ${
      hasCategoryConditions(rule)
        ? `<category_conditions>
      ${rule.categoryFilterType ? `<filter_type>${rule.categoryFilterType}</filter_type>` : ""}
      ${rule.categoryFilters?.map((category) => `<category>${category.name}</category>`).join("\n      ")}
    </category_conditions>`
        : ""
    }
  </conditions>

  ${
    rule.group?.items?.length
      ? `<patterns>
      ${rule.group.items
        .map(
          (item) =>
            `<pattern>
<type>${item.type}</type>
<value>${item.value}</value>
</pattern>`,
        )
        .join("\n      ")}
  </patterns>`
      : ""
  }
</rule>`;
}

function rulesToXML(rules: RuleWithRelations[]) {
  return `<user_rules>
${rules.map((rule) => ruleToXML(rule)).join("\n")}
</user_rules>`;
}

function hasStaticConditions(rule: RuleWithRelations) {
  return Boolean(rule.from || rule.to || rule.subject || rule.body);
}

function hasCategoryConditions(rule: RuleWithRelations) {
  return Boolean(rule.categoryFilters && rule.categoryFilters.length > 0);
}

function getPatternType(type: string) {
  if (type === "from") return GroupItemType.FROM;
  if (type === "subject") return GroupItemType.SUBJECT;
}

async function trackToolCall({ tool, email }: { tool: string; email: string }) {
  return posthogCaptureEvent(email, "AI Assistant Tool Call", { tool });
}
