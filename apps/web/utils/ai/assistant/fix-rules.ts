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
import { isDefined, type ParsedMessage } from "@/utils/types";
import {
  createRuleSchema,
  type CreateRuleSchemaWithCategories,
  getCreateRuleSchemaWithCategories,
} from "@/utils/ai/rule/create-rule-schema";
import { addGroupItem, deleteGroupItem } from "@/utils/group/group-item";
import {
  addRuleCategories,
  partialUpdateRule,
  removeRuleCategories,
  safeCreateRule,
} from "@/utils/rule/rule";
import { updateCategoryForSender } from "@/utils/categorize/senders/categorize";
import { findSenderByEmail } from "@/utils/sender";
import { emailToContent } from "@/utils/mail";

const logger = createScopedLogger("ai-fix-rules");

export async function processUserRequest({
  user,
  rules,
  originalEmail,
  userRequestEmail,
  additionalMessages,
  matchedRule,
  categories,
  senderCategory,
}: {
  user: Pick<User, "id" | "email" | "about"> & UserAIFields;
  rules: RuleWithRelations[];
  userRequestEmail: ParsedMessage;
  additionalMessages?: { role: "assistant" | "user"; content: string }[];
  originalEmail: ParsedMessage;
  matchedRule: RuleWithRelations | null;
  categories: Pick<Category, "id" | "name">[] | null;
  senderCategory: string | null;
}) {
  const userRequestContent = emailToContent(userRequestEmail, {
    extractReply: true,
  });
  const originalEmailContent = emailToContent(originalEmail);

  const system = `You are an email management assistant that helps users manage their email rules.
You can fix rules using these specific operations:

1. Edit Rule Components:
- Change conditional operator (AND/OR logic)
- Modify AI instructions
- Update static conditions (from, to, subject, body)
- Add or remove categories

2. Manage Groups:
- Add items to groups (email addresses or subject patterns)
- Remove items from groups
- Never mix static conditions with group conditions

3. Create New Rules:
- Create new rules when existing ones cannot be modified to fit the need

When fixing rules:
- Make one precise change at a time
- Prefer minimal changes that solve the problem
- Only add AI instructions if simpler conditions won't suffice
- Keep rules general and maintainable

Rule matching logic:
- All static conditions (from, to, subject, body) use AND logic - meaning all conditions must match
- Top level conditions (static, group, category, AI instructions) can use either AND or OR logic, controlled by the conditionalOperator setting

Best practices:
- For static conditions, use email patterns (e.g., '@company.com') when matching multiple addresses
- For groups, collect similar items that are likely to appear together (e.g., newsletter senders, receipt subject patterns)
- Only use subject patterns if they are likely to be recurring (e.g., "Your Monthly Statement", "Order Confirmation")

Always end by using the reply tool to explain what changes were made.`;

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
${userRequestContent}
</user_request>

${
  user.about
    ? `<user_about>
  ${user.about}
</user_about>`
    : ""
}

<original_email>
${originalEmailContent}
</original_email>

${
  categories?.length
    ? `<sender_category>
${senderCategory || "No category"}
</sender_category>`
    : ""
}`;

  logger.trace("Input", { system, prompt });

  const result = await chatCompletionTools({
    userAi: user,
    messages: [
      {
        role: "system",
        content: system,
      },
      {
        role: "user",
        content: prompt,
      },
      ...(additionalMessages || []),
    ],
    tools: {
      create_rule: tool({
        description: "Create a new rule",
        parameters: (categories
          ? getCreateRuleSchemaWithCategories(
              categories.map((c) => c.name) as [string, ...string[]],
            )
          : createRuleSchema
        )
          // Simplify rule creation to not include groups
          .extend({
            condition: createRuleSchema.shape.condition.omit({ group: true }),
          }),
        execute: async ({ name, condition, actions }) => {
          logger.info("Create Rule", { name, condition, actions });

          const conditions =
            condition as CreateRuleSchemaWithCategories["condition"];

          const groupId = null;

          await safeCreateRule(
            { name, condition, actions },
            user.id,
            groupId,
            conditions.categories?.categoryFilters || [],
          );

          return { success: true };
        },
      }),
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

          await partialUpdateRule(ruleName, { conditionalOperator });

          return { success: true };
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

          await partialUpdateRule(ruleName, { instructions: aiInstructions });

          return { success: true };
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

          await partialUpdateRule(ruleName, {
            from: staticConditions?.from,
            to: staticConditions?.to,
            subject: staticConditions?.subject,
          });

          return { success: true };
        },
      }),
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
      ...(categories
        ? {
            update_sender_category: getUpdateCategoryTool(user.id, categories),
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
                logger.info("Add Rule Categories", options);

                const { ruleName } = options;

                const rule = rules.find((r) => r.name === ruleName);

                if (!rule) {
                  logger.error("Rule not found", { ruleName });
                  return { error: "Rule not found" };
                }

                const categoryIds = options.categories
                  .map((c) => categories.find((cat) => cat.name === c))
                  .filter(isDefined)
                  .map((c) => c.id);

                await addRuleCategories(rule.id, categoryIds);

                return { success: true };
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
                logger.info("Remove Rule Categories", options);

                const { ruleName } = options;

                const rule = rules.find((r) => r.name === ruleName);

                if (!rule) {
                  logger.error("Rule not found", { ruleName });
                  return { error: "Rule not found" };
                }

                const categoryIds = options.categories
                  .map((c) => categories.find((cat) => cat.name === c))
                  .filter(isDefined)
                  .map((c) => c.id);

                await removeRuleCategories(rule.id, categoryIds);

                return { success: true };
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

const getUpdateCategoryTool = (
  userId: string,
  categories: Pick<Category, "id" | "name">[],
) =>
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

      const existingSender = await findSenderByEmail({
        userId,
        email: sender,
      });

      const cat = categories.find((c) => c.name === category);

      if (!cat) {
        logger.error("Category not found", { category });
        return { error: "Category not found" };
      }

      await updateCategoryForSender({
        userId,
        sender: existingSender?.email || sender,
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
