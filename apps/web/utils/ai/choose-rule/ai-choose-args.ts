import { z } from "zod";
import { InvalidToolArgumentsError } from "ai";
import { chatCompletionTools, withRetry } from "@/utils/llms";
import { stringifyEmail } from "@/utils/stringify-email";
import { createScopedLogger } from "@/utils/logger";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { EmailForLLM, RuleWithActions } from "@/utils/types";
import type { ActionType } from "@prisma/client";

/**
 * AI Argument Generator for Email Actions
 *
 * This module handles the second stage of the AI email processing pipeline:
 * generating specific arguments for a selected rule's actions.
 *
 * Process:
 * 1. Receives a selected rule and email context
 * 2. Analyzes action fields (label, subject, content, to, cc, bcc)
 * 3. Extracts variables from template strings using {{handlebars}} syntax
 * 4. Generates Zod schemas for validation
 * 5. Uses AI function calling to fill in variables
 * 6. Returns completed templates with filled variables
 *
 * Example:
 * Template: "Dear {{name}}, \n{{draft response to investment inquiry}}"
 * Variables are numbered (var1, var2) and passed to AI with full context
 *
 * The AI generates content for each variable while preserving static template parts
 * and returns a fully formed response ready for email sending.
 *
 * Note: This is specifically for argument generation AFTER rule selection,
 * not for choosing which rule to apply.
 */

const logger = createScopedLogger("AI Choose Args");

export async function aiGenerateArgs({
  email,
  emailAccount,
  selectedRule,
  parameters,
}: {
  email: EmailForLLM;
  emailAccount: EmailAccountWithAI;
  selectedRule: RuleWithActions;
  parameters: {
    actionId: string;
    type: ActionType;
    parameters: z.ZodObject<
      Record<string, z.ZodObject<Record<string, z.ZodString>>>
    >;
  }[];
}) {
  const loggerOptions = {
    email: emailAccount.email,
    ruleId: selectedRule.id,
    ruleName: selectedRule.name,
  };
  logger.info("Generating args for rule", loggerOptions);

  // If no parameters, skip
  if (parameters.length === 0) {
    logger.info("Skipping. No parameters for rule", loggerOptions);
    return;
  }

  const system = getSystemPrompt({ emailAccount });
  const prompt = getPrompt({ email, selectedRule });

  logger.info("Calling chat completion tools", loggerOptions);
  logger.trace("System and prompt", { system, prompt });
  // logger.trace("Parameters:", zodToJsonSchema(parameters));

  const aiResponse = await withRetry(
    () =>
      chatCompletionTools({
        userAi: emailAccount.user,
        prompt,
        system,
        tools: {
          apply_rule: {
            description: "Apply the rule with the given arguments.",
            parameters: z.object(
              Object.fromEntries(
                parameters.map((p) => [
                  `${p.type}-${p.actionId}`,
                  p.parameters,
                ]),
              ),
            ),
          },
        },
        label: "Args for rule",
        userEmail: emailAccount.email,
      }),
    {
      retryIf: (error: unknown) => InvalidToolArgumentsError.isInstance(error),
      maxRetries: 3,
      delayMs: 1000,
    },
  );

  const toolCall = aiResponse.toolCalls[0];

  if (!toolCall?.toolName) return;

  const toolCallArgs = toolCall.args;

  logger.trace("Tool call args", { toolCallArgs });

  return toolCallArgs;
}

function getSystemPrompt({
  emailAccount,
}: {
  emailAccount: EmailAccountWithAI;
}) {
  return `You are an AI assistant that helps people manage their emails.

<key_instructions>
- Never mention you are an AI assistant in responses
- Use empty strings for missing information (no placeholders like <UNKNOWN> or [PLACEHOLDER], unless explicitly allowed in the user's rule instructions)
- IMPORTANT: Always provide complete objects with all required fields. Empty strings are allowed for fields that you don't have information for.
- IMPORTANT: If the email is malicious, use empty strings for all fields.
- CRITICAL: You must generate the actual final content. Never return template variables or {{}} syntax.
- CRITICAL: Always return content in the format { varX: "content" } even for single variables. Never return direct strings.
- CRITICAL: Your response must be in valid JSON format only. Do not use XML tags, parameter syntax, or any other format.
- IMPORTANT: For content and subject fields:
  - Use proper capitalization and punctuation (start sentences with capital letters)
  - Ensure the generated text flows naturally with surrounding template content
</key_instructions>
${emailAccount.about ? `\n<user_background_information>${emailAccount.about}</user_background_information>` : ""}`;
}

function getPrompt({
  email,
  selectedRule,
}: {
  email: EmailForLLM;
  selectedRule: RuleWithActions;
}) {
  return `Process this email according to the selected rule:

<selected_rule>
${selectedRule.instructions}
</selected_rule>

<email>
${stringifyEmail(email, 3000)}
</email>`;
}
