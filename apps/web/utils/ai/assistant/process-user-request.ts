import { InvalidToolArgumentsError, tool } from "ai";
import { z } from "zod";
import { chatCompletionTools, withRetry } from "@/utils/llms";
import { createScopedLogger } from "@/utils/logger";
import type { User } from "@prisma/client";
import type { UserAIFields } from "@/utils/llms/types";
import {
  createPromptFromRule,
  type RuleWithRelations,
} from "@/utils/ai/rule/create-prompt-from-rule";
import { aiRuleFix } from "@/utils/ai/rule/rule-fix";
import type { EmailForLLM } from "@/utils/ai/choose-rule/stringify-email";
import { updateRuleInstructionsAndPromptFile } from "@/utils/actions/rule";
import { replyToUser } from "@/utils/assistant/reply";

const logger = createScopedLogger("AssistantCommand");

const fixRuleSchema = z.object({
  expectedRuleName: z
    .string()
    .optional()
    .describe(
      "The name of the rule that the user expected to be applied. Return `None` if you don't know which rule the user expected to be applied.",
    ),
  explanation: z
    .string()
    .optional()
    .describe(
      "The explanation for why the rule is incorrect. Leave blank if you don't know why.",
    ),
});

const replySchema = z.object({
  content: z.string().describe("The content of the reply to the user"),
});

export async function processUserRequest({
  user,
  rules,
  userEmailForLLM,
  originalEmailForLLM,
  actualRule,
}: {
  user: Pick<User, "id" | "email" | "about"> & UserAIFields;
  rules: RuleWithRelations[];
  userEmailForLLM: EmailForLLM;
  originalEmailForLLM: EmailForLLM;
  actualRule: RuleWithRelations | null;
}) {
  const system = `You are an email management assistant that helps users manage their email rules.
You can fix rules based on the user's request.
Always confirm your actions with clear, concise responses.

You can also reply to the user with information or questions.
When you've completed your actions, you should reply to the user with a confirmation message.

If the user asks you to do an action which you can't do, you should reply to the user with a message saying you can't do that.`;

  const prompt = `<current_user_rules>
${rules
  .map(
    (rule) => `<rule>
  <rule_name>${rule.name}</rule_name>
  <rule_instructions>${createPromptFromRule(rule)}</rule_instructions>
</rule>`,
  )
  .join("\n")}
</current_user_rules>

<user_request>
${userEmailForLLM.content}
</user_request>`;

  logger.trace("Input", { system, prompt });

  const result = await withRetry(
    () =>
      chatCompletionTools({
        userAi: user,
        prompt,
        system,
        tools: {
          fix_rule: tool({
            description: "Fix a rule",
            parameters: fixRuleSchema,
            execute: async ({ explanation, expectedRuleName }) => {
              const expectedRule = expectedRuleName
                ? (rules.find((rule) => rule.name === expectedRuleName) ?? null)
                : null;

              if (expectedRule === actualRule) {
                logger.info("Expected rule is the same as actual rule");
                await replyToUser(
                  "The rule you expected to be applied is already applied.",
                );
                return;
              }

              const { ruleToFix, fixedInstructions } = await aiRuleFix({
                user,
                actualRule,
                expectedRule,
                email: originalEmailForLLM,
                explanation,
              });

              const rule =
                ruleToFix === "actual_rule" ? actualRule : expectedRule;

              if (!rule) {
                logger.error("Rule not found", { ruleToFix });
                return;
              }

              await updateRuleInstructionsAndPromptFile({
                userId: user.id,
                ruleId: rule.id,
                instructions: fixedInstructions,
                currentRule: actualRule,
              });
            },
          }),
          reply: tool({
            description: "Reply to the user with information or questions",
            parameters: replySchema,
            execute: async ({ content }) => {
              return replyToUser(content);
            },
          }),
        },
        maxSteps: 1,
        label: "Assistant Command",
        userEmail: user.email || "",
      }),
    {
      retryIf: (error: unknown) => InvalidToolArgumentsError.isInstance(error),
      maxRetries: 3,
      delayMs: 1000,
    },
  );

  logger.trace("Assistant command result", { result });

  return result;
}
