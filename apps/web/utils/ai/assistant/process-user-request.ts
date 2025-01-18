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

const logger = createScopedLogger("AssistantCommand");

const addRuleSchema = z.object({
  name: z.string(),
  instructions: z.string(),
});

const editRuleSchema = z.object({
  ruleId: z.string(),
  updates: z.object({
    name: z.string().optional(),
    instructions: z.string().optional(),
  }),
});

const replySchema = z.object({
  content: z.string(),
});

export async function processUserRequest({
  user,
  messageContent,
  rules,
}: {
  user: Pick<User, "email"> & UserAIFields;
  messageContent: string;
  rules: RuleWithRelations[];
}) {
  const system = `You are an email management assistant that helps users manage their email rules.
You can add rules, edit rules, or remove rules based on the user's request.
Always confirm your actions with clear, concise responses.

You can also reply to the user with information or questions.
When you've completed your actions, you should reply to the user with a confirmation message.`;

  const prompt = `<current_user_rules>
${rules.map((rule) => `<rule>${createPromptFromRule(rule)}</rule>`).join("\n")}
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
          add_rule: tool({
            description: "Add a new rule",
            parameters: addRuleSchema,
            execute: async ({ name, instructions }) => ({ name, instructions }),
          }),
          edit_rule: tool({
            description: "Edit an existing rule",
            parameters: editRuleSchema,
            execute: async ({ ruleId, updates }) => ({ ruleId, updates }),
          }),
          remove_rule: tool({
            description: "Remove an existing rule",
            parameters: z.object({
              ruleId: z.string(),
            }),
            execute: async ({ ruleId }) => ({ ruleId }),
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
