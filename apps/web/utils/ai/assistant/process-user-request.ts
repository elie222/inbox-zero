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

const logger = createScopedLogger("AssistantCommand");

const fixRuleSchema = z.object({
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
  messageContent,
  rules,
}: {
  user: Pick<User, "email" | "about"> & UserAIFields;
  messageContent: string;
  rules: RuleWithRelations[];
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
  <rule_id>${rule.id}</rule_id>
  <rule_instructions>${createPromptFromRule(rule)}</rule_instructions>
</rule>`,
  )
  .join("\n")}
</current_user_rules>

<user_request>
${messageContent}
</user_request>`;

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
            execute: async ({ explanation }) => {
              const { rule, fixedInstructions } = await aiRuleFix({
                user,
                actualRule: null, // TODO: get actual rule
                expectedRule: null, // TODO: get expected rule
                email: {
                  // TODO: email
                  from: "",
                  subject: "",
                  content: "",
                },
                explanation,
              });

              return { rule, fixedInstructions };
            },
          }),
          reply: tool({
            description: "Reply to the user with information or questions",
            parameters: replySchema,
            execute: async ({ content }) => ({ content }),
          }),
        },
        maxSteps: 10,
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
