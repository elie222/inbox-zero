import { tool } from "ai";
import { z } from "zod";
import { chatCompletionTools } from "@/utils/llms";
import { createScopedLogger } from "@/utils/logger";
import {
  type Category,
  GroupItemType,
  LogicalOperator,
  type User,
} from "@prisma/client";
import type { UserAIFields } from "@/utils/llms/types";
import type { RuleWithRelations } from "@/utils/ai/rule/create-prompt-from-rule";
import type { ParsedMessage } from "@/utils/types";
import { getEmailFromMessage } from "@/utils/ai/choose-rule/get-email-from-message";
import {
  createRuleSchema,
  getCreateRuleSchemaWithCategories,
} from "@/utils/ai/rule/create-rule-schema";
import { addGroupItem, deleteGroupItem } from "@/utils/actions/group";
import { safeCreateRule } from "@/utils/rule/rule";
import { updateCategoryForSender } from "@/utils/categorize/senders/categorize";
import { findSenderByEmail } from "@/utils/sender";

const logger = createScopedLogger("ai-fix-rules");

export async function processUserRequest({
  user,
  rules,
  userRequestEmail,
  originalEmail,
  matchedRule,
  categories,
  senderCategory,
}: {
  user: Pick<User, "id" | "email" | "about"> & UserAIFields;
  rules: RuleWithRelations[];
  userRequestEmail: ParsedMessage;
  originalEmail: ParsedMessage;
  matchedRule: RuleWithRelations | null;
  categories: Pick<Category, "id" | "name">[] | null;
  senderCategory: string | null;
}) {
  const userRequestEmailForLLM = getEmailFromMessage(userRequestEmail);
  const originalEmailForLLM = getEmailFromMessage(originalEmail);

  const system = `You are an email management assistant that helps users manage their email rules.
You can fix rules by adjusting their conditions, including:
- AI instructions
- Static conditions (from, to, subject, body)
- Static group conditions (from, subject)
- Category assignments

Prefer to fix rules by editing them directly, rather than creating new ones.

When fixing a rule, explain what changes you're making and why. Always confirm your actions with clear, concise responses.

Rule matching logic:
- All static conditions (from, to, subject, body) use AND logic - meaning all conditions must match
- Top level conditions (static, group, category, AI instructions) can use either AND or OR logic, controlled by the conditionalOperator setting

Group conditions:
- When a group exists, use add_to_group/remove_from_group instead of editing the rule directly
- Never add static conditions to a rule that uses groups - this defeats the purpose of groups
- Only add subject patterns to groups if they are recurring across multiple emails (e.g., "Monthly Statement", "Order Confirmation")
- Groups should be used to maintain collections of similar items (e.g., newsletter senders, receipt patterns)

When fixing a rule, prefer minimal changes that solve the problem:
- Only add AI instructions if simpler conditions won't suffice
- Make the smallest change that will fix the issue
- Keep rules general and maintainable`;

  const prompt = `<matched_rule>
${matchedRule ? ruleToXML(matchedRule) : "No rule matched"}
</matched_rule>

${
  !matchedRule
    ? `<user_rules>
${rules.map((rule) => ruleToXML(rule)).join("\n")}
</user_rules>`
    : ""
}

<user_request>
${userRequestEmailForLLM.content}
</user_request>

${
  user.about
    ? `<user_about>
  ${user.about}
</user_about>`
    : ""
}

<original_email>
${originalEmailForLLM.content}
</original_email>

${
  categories?.length
    ? `<sender_category>
${senderCategory}
</sender_category>`
    : ""
}`;

  logger.trace("Input", { system, prompt });

  const result = await chatCompletionTools({
    userAi: user,
    prompt,
    system,
    tools: {
      create_rule: tool({
        description: "Create a new rule",
        parameters: categories
          ? getCreateRuleSchemaWithCategories(
              categories.map((c) => c.name) as [string, ...string[]],
            )
          : createRuleSchema,
        execute: async ({ name, condition, actions }) => {
          logger.info("Create Rule", { name, condition, actions });

          await safeCreateRule(
            { name, condition, actions },
            user.id,
            null, // TODO: groupId: string | null
            null, // TODO: categoryIds: string[] | null
          );

          return { success: true };
        },
      }),
      // conditional operator
      edit_conditional_operator: tool({
        description: "Edit the conditional operator of a rule",
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
        },
      }),
      // ai instructions
      edit_ai_instructions: tool({
        description: "Edit the AI instructions of a rule",
        parameters: z.object({
          ruleName: z.string().describe("The exact name of the rule to edit"),
          aiInstructions: z.string().describe("The new AI instructions"),
        }),
        execute: async ({ ruleName, aiInstructions }) => {
          logger.info("Edit AI Instructions", { ruleName, aiInstructions });
        },
      }),
      // static conditions
      edit_static_conditions: tool({
        description: "Edit the static conditions of a rule",
        parameters: z.object({
          ruleName: z.string().describe("The exact name of the rule to edit"),
          staticConditions: createRuleSchema.shape.condition.shape.static,
        }),
        execute: async ({ ruleName, staticConditions }) => {
          logger.info("Edit Static Conditions", { ruleName, staticConditions });
        },
      }),
      // groups
      add_to_group: tool({
        description: "Add a group item",
        parameters: z.object({
          groupName: z
            .string()
            .describe("The name of the group to add the group item to"),
          type: z
            .enum(["from", "subject"])
            .describe("The type of the group item to add"),
          value: z
            .string()
            .describe(
              "The value of the group item to add. e.g. '@company.com', 'matt@company.com', 'Receipt from'",
            ),
        }),
        execute: async ({ groupName, type, value }) => {
          logger.info("Add To Group", { groupName, type, value });

          const group = rules.find((r) => r.group?.name === groupName)?.group;
          const groupId = group?.id;

          if (!groupId) {
            logger.error("Group not found", { groupName });
            return { error: "Group not found" };
          }

          const groupItemType = getGroupItemType(type);

          if (!groupItemType) {
            logger.error("Invalid group item type", { type });
            return { error: "Invalid group item type" };
          }

          await addGroupItem({ groupId, type: groupItemType, value });

          return { success: true };
        },
      }),
      ...(matchedRule?.group
        ? {
            remove_from_group: tool({
              description: "Remove a group item ",
              parameters: z.object({
                type: z
                  .enum(["from", "subject"])
                  .describe("The type of the group item to remove"),
                value: z
                  .string()
                  .describe("The value of the group item to remove"),
              }),
              execute: async ({ type, value }) => {
                logger.info("Remove From Group", { type, value });

                const groupItemType = getGroupItemType(type);

                if (!groupItemType) {
                  logger.error("Invalid group item type", { type });
                  return { error: "Invalid group item type" };
                }

                const groupItem = matchedRule?.group?.items?.find(
                  (item) => item.type === groupItemType && item.value === value,
                );

                if (!groupItem) {
                  logger.error("Group item not found", { type, value });
                  return { error: "Group item not found" };
                }

                await deleteGroupItem({
                  id: groupItem.id,
                  userId: user.id,
                });

                return { success: true };
              },
            }),
          }
        : {}),
      // categories
      ...(categories
        ? {
            change_sender_category: getChangeCategoryTool(user.id, categories),
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
              execute: async ({ ruleName, categories }) => {
                logger.info("Add Rule Categories", { ruleName, categories });
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
              execute: async ({ ruleName, categories }) => {
                logger.info("Remove Rule Categories", { ruleName, categories });
              },
            }),
          }
        : {}),
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
    userEmail: user.email || "",
  });

  logger.trace("Tool Calls", {
    toolCalls: result.steps.flatMap((step) => step.toolCalls),
  });

  return result;
}

const getChangeCategoryTool = (
  userId: string,
  categories: Pick<Category, "id" | "name">[],
) =>
  tool({
    description: "Change the category of a sender",
    parameters: z.object({
      sender: z.string().describe("The sender to change"),
      category: z
        .enum([
          ...(categories.map((c) => c.name) as [string, ...string[]]),
          "none",
        ])
        .describe("The name of the category to assign"),
    }),
    execute: async ({ sender, category }) => {
      logger.info("Change Category", { sender, category });

      const existingSender = await findSenderByEmail(userId, sender);

      if (!existingSender) {
        logger.error("Sender not found", { sender });
        return { error: "Sender not found" };
      }

      const cat = categories.find((c) => c.name === category);

      if (!cat) {
        logger.error("Category not found", { category });
        return { error: "Category not found" };
      }

      await updateCategoryForSender({
        userId,
        sender: existingSender.email,
        categoryId: cat.id,
      });
      return { success: true };
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
      rule.group
        ? `<group_condition>
      <group>${rule.group.name}</group>
      <group_items>
        ${
          rule.group.items
            ? rule.group.items
                .map(
                  (item) =>
                    `<item>
  <type>${item.type}</type>
  <value>${item.value}</value>
</item>`,
                )
                .join("\n      ")
            : "No group items"
        }
      </group_items>
    </group_condition>`
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
</rule>`;
}

function hasStaticConditions(rule: RuleWithRelations) {
  return rule.from || rule.to || rule.subject || rule.body;
}

function hasCategoryConditions(rule: RuleWithRelations) {
  return rule.categoryFilters && rule.categoryFilters.length > 0;
}

function getGroupItemType(type: string) {
  if (type === "from") return GroupItemType.FROM;
  if (type === "subject") return GroupItemType.SUBJECT;
}
