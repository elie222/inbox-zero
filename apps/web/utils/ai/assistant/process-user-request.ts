import { stepCountIs, tool } from "ai";
import { z } from "zod";
import { createGenerateText } from "@/utils/llms";
import { createScopedLogger, type Logger } from "@/utils/logger";
import {
  type Category,
  GroupItemType,
  LogicalOperator,
  type Rule,
} from "@prisma/client";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { RuleWithRelations } from "@/utils/rule/types";
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
import { env } from "@/env";
import { posthogCaptureEvent } from "@/utils/posthog";
import { getUserCategoriesForNames } from "@/utils/category.server";
import { getModel } from "@/utils/llms/model";
import { getUserInfoPrompt } from "@/utils/ai/helpers";

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
  const logger = createScopedLogger("ai-fix-rules").with({
    emailAccountId: emailAccount.id,
    userId: emailAccount.userId,
    email: emailAccount.email,
    messageId: originalEmail?.id,
    threadId: originalEmail?.threadId,
  });

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
When you've made updates, include a link to the rules page at the end of your reply: ${env.NEXT_PUBLIC_BASE_URL}/assistant?tab=rules
If you are unable to fix the rule, say so.`;

  const prompt = `${
    originalEmail
      ? `<matched_rule>
${matchedRule ? ruleToXML(matchedRule) : "No rule matched"}
</matched_rule>`
      : ""
  }

${!matchedRule ? userRules : ""}

${getUserInfoPrompt({ emailAccount })}

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

  const createdRules = new Map<string, RuleWithRelations>();
  const updatedRules = new Map<string, RuleWithRelations>();

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

  const modelOptions = getModel(emailAccount.user, "chat");

  const generateText = createGenerateText({
    userEmail: emailAccount.email,
    label: "Process user request",
    modelOptions,
  });

  const result = await generateText({
    ...modelOptions,
    messages: allMessages,
    stopWhen: stepCountIs(5),
    tools: {
      update_conditional_operator: tool({
        description: "Update the conditional operator of a rule",
        inputSchema: z.object({
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
        inputSchema: z.object({
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
        inputSchema: z.object({
          ruleName: z.string().describe("The exact name of the rule to edit"),
          staticConditions: createRuleSchema(emailAccount.account.provider)
            .shape.condition.shape.static,
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
      //   inputSchema: z.object({
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
      //         groupName,
      //       });
      //       return { error: "Group not found" };
      //     }

      //     const groupItemType = getPatternType(type);

      //     if (!groupItemType) {
      //       logger.error("Invalid pattern type", {
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
              inputSchema: z.object({
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
              logger,
            }),
            add_categories: tool({
              description: "Add categories to a rule",
              inputSchema: z.object({
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
              inputSchema: z.object({
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
        inputSchema: categories
          ? getCreateRuleSchemaWithCategories(
              categories.map((c) => c.name) as [string, ...string[]],
              emailAccount.account.provider,
            )
          : createRuleSchema(emailAccount.account.provider),
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
              result: {
                name,
                condition,
                actions: actions.map((action) => ({
                  ...action,
                  fields: action.fields
                    ? {
                        ...action.fields,
                        label: action.fields.label ?? null,
                        to: action.fields.to ?? null,
                        cc: action.fields.cc ?? null,
                        bcc: action.fields.bcc ?? null,
                        subject: action.fields.subject ?? null,
                        content: action.fields.content ?? null,
                        webhookUrl: action.fields.webhookUrl ?? null,
                        folderName: action.fields.folderName ?? null,
                      }
                    : null,
                })),
              },
              emailAccountId: emailAccount.id,
              categoryIds,
              provider: emailAccount.account.provider,
              runOnThreads: true,
            });

            if ("error" in rule) {
              logger.error("Error while creating rule", {
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

            logger.error("Failed to create rule", { error: message });

            return {
              error: "Failed to create rule",
              message,
            };
          }
        },
      }),
      list_rules: tool({
        description: "List all existing rules for the user",
        inputSchema: z.object({}),
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
        inputSchema: z.object({
          content: z.string().describe("The content of the reply"),
        }),
        // no execute function - invoking it will terminate the agent
      }),
    },
  });

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
  userEmail,
  logger,
}: {
  emailAccountId: string;
  categories: Pick<Category, "id" | "name">[];
  userEmail: string;
  logger: Logger;
}) =>
  tool({
    description: "Update the category of a sender",
    inputSchema: z.object({
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
        logger.error("Category not found", { category });
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
