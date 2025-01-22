import { InvalidToolArgumentsError, tool } from "ai";
import type { gmail_v1 } from "@googleapis/gmail";
import { z } from "zod";
import { chatCompletionTools, withRetry } from "@/utils/llms";
import { createScopedLogger } from "@/utils/logger";
import type { User } from "@prisma/client";
import type { UserAIFields } from "@/utils/llms/types";
import type { RuleWithRelations } from "@/utils/ai/rule/create-prompt-from-rule";
import type { ParsedMessage } from "@/utils/types";
import { getEmailFromMessage } from "@/utils/ai/choose-rule/get-email-from-message";
import {
  createRuleSchema,
  getCreateRuleSchemaWithCategories,
} from "@/utils/ai/rule/create-rule-schema";

const logger = createScopedLogger("ai-fix-rules");

const getChangeCategoryTool = (categories: [string, ...string[]]) =>
  tool({
    description: "Change the category of a sender",
    parameters: z.object({
      sender: z.string().describe("The sender to change"),
      category: z
        .enum([...categories, "none"])
        .describe("The name of the category to assign"),
    }),
    execute: async ({ sender, category }) => {
      logger.info("Change Category", { sender, category });
      return { success: true };
    },
  });

export async function processUserRequest({
  user,
  rules,
  userRequestEmail,
  originalEmail,
  matchedRule,
  gmail,
  categories,
  senderCategory,
}: {
  user: Pick<User, "id" | "email" | "about"> & UserAIFields;
  rules: RuleWithRelations[];
  userRequestEmail: ParsedMessage;
  originalEmail: ParsedMessage;
  matchedRule: RuleWithRelations | null;
  gmail: gmail_v1.Gmail;
  categories: [string, ...string[]] | null;
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
- When a group exists, prefer to add/remove group items over changing AI instructions
- Only add subject patterns to groups if they are recurring across multiple emails (e.g., "Monthly Statement", "Order Confirmation")

When fixing a rule, prefer minimal changes that solve the problem:
- Only add AI instructions if simpler conditions won't suffice
- Make the smallest change that will fix the issue`;

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

  const result = await withRetry(
    () =>
      chatCompletionTools({
        userAi: user,
        prompt,
        system,
        tools: {
          edit_rule: tool({
            description: "Fix a rule by adjusting its conditions",
            parameters: z.object({
              ruleName: z
                .string()
                .optional()
                .describe("The exact name of the rule to fix"),
              explanation: z
                .string()
                .describe("Explanation of the changes being made to the rule"),
              condition: createRuleSchema.shape.condition,
            }),
            execute: async ({ ruleName, explanation, condition }) => {
              logger.trace("Edit Rule", { ruleName, explanation, condition });

              const rule = ruleName
                ? rules.find((r) => r.name === ruleName)
                : matchedRule;

              if (!rule) {
                logger.error("Rule not found", { ruleName });
                return { error: "Rule not found" };
              }

              // // Update rule in database
              // const updates: Partial<RuleWithRelations> = {};

              // if (condition.aiInstructions) {
              //   updates.instructions = condition.aiInstructions;
              // }

              // if (condition.static) {
              //   Object.assign(updates, condition.static);
              // }

              // if (condition.conditionalOperator) {
              //   updates.conditionalOperator = condition.conditionalOperator;
              // }

              // if (condition.categories) {
              //   if (condition.categories.categoryFilters?.length) {
              //     const categories = await prisma.category.findMany({
              //       where: {
              //         name: { in: condition.categories.categoryFilters },
              //         userId: user.id,
              //       },
              //     });

              //     if (categories.length) {
              //       updates.categoryFilters = {
              //         set: categories.map((cat) => ({ id: cat.id })),
              //       };
              //     }
              //   }

              //   if (condition.categories.categoryFilterType) {
              //     updates.categoryFilterType =
              //       condition.categories.categoryFilterType;
              //   }
              // }

              // await prisma.rule.update({
              //   where: { id: rule.id },
              //   data: updates,
              // });

              // // Update user's prompt file if AI instructions changed
              // if (condition.aiInstructions) {
              //   await updateRuleAction({
              //     userId: user.id,
              //     ruleId: rule.id,
              //     instructions: condition.aiInstructions,
              //   });
              // }

              // // Send confirmation email
              // await replyToEmail(
              //   gmail,
              //   originalEmail,
              //   `I've updated the rule "${rule.name}". ${explanation}`,
              // );

              return { success: true };
            },
          }),
          create_rule: tool({
            description: "Create a new rule",
            parameters: categories
              ? getCreateRuleSchemaWithCategories(categories)
              : createRuleSchema,
            execute: async ({ name, condition, actions }) => {
              logger.info("Create Rule", { name, condition, actions });
              return { success: true };
            },
          }),
          ...(categories
            ? {
                change_sender_category: getChangeCategoryTool(categories),
              }
            : {}),
          add_to_group: tool({
            description: "Add a group item",
            parameters: z.object({
              type: z
                .enum(["from", "to", "subject"])
                .describe("The type of the group item to add"),
              value: z
                .string()
                .describe(
                  "The value of the group item to add. eg '@company.com', 'matt@company.com', 'Receipt from'",
                ),
            }),
            execute: async ({ type, value }) => {
              logger.info("Add To Group", { type, value });
              return { success: true };
            },
          }),
          remove_from_group: tool({
            description: "Remove a group item ",
            parameters: z.object({
              type: z
                .enum(["from", "to", "subject"])
                .describe("The type of the group item to remove"),
              value: z
                .string()
                .describe("The value of the group item to remove"),
            }),
            execute: async ({ type, value }) => {
              logger.info("Remove From Group", { type, value });
              return { success: true };
            },
          }),
          reply: tool({
            description: "Send an email reply to the user",
            parameters: z.object({
              content: z
                .string()
                .describe(
                  "The reply content. Do not send multiple replies in a row.",
                ),
            }),
            // no execute function - invoking it will terminate the agent
          }),
        },
        maxSteps: 5,
        label: "Fix Rule",
        userEmail: user.email || "",
      }),
    {
      retryIf: (error: unknown) => InvalidToolArgumentsError.isInstance(error),
      maxRetries: 3,
      delayMs: 1000,
    },
  );

  logger.trace("Tool Calls", {
    toolCalls: result.steps.flatMap((step) => step.toolCalls),
  });

  return result;
}

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
