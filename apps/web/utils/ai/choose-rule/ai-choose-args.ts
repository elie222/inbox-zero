import { z } from "zod";
import type { UserAIFields } from "@/utils/llms/types";
import type { Action, User } from "@prisma/client";
import { chatCompletionTools, withRetry } from "@/utils/llms";
import { stringifyEmail } from "@/utils/stringify-email";
import {
  type EmailForLLM,
  type RuleWithActions,
  isDefined,
} from "@/utils/types";
import { createScopedLogger } from "@/utils/logger";
import { InvalidToolArgumentsError } from "ai";

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

type ActionRequiringAi = ReturnType<
  typeof extractActionsNeedingAiGeneration
>[number];

type ActionArgResponse = {
  [key: `${string}-${string}`]: {
    [field: string]: {
      [key: `var${number}`]: string;
    };
  };
};

export async function getActionItemsWithAiArgs({
  email,
  user,
  selectedRule,
}: {
  email: EmailForLLM;
  user: Pick<User, "email" | "about"> & UserAIFields;
  selectedRule: RuleWithActions;
}): Promise<Action[]> {
  const parameters = extractActionsNeedingAiGeneration(selectedRule.actions);

  if (parameters.length === 0) return selectedRule.actions;

  const result = await getArgsAiResponse({
    email,
    user,
    selectedRule,
    parameters,
  });

  // Combine the result with the original action items
  const combinedActions = selectedRule.actions.map((action) => {
    const aiAction = result?.[`${action.type}-${action.id}`];
    if (!aiAction) return action;

    const updatedAction = { ...action };

    // Merge variables for each field that has AI-generated content
    for (const [field, vars] of Object.entries(aiAction)) {
      // Only process fields that we know can contain template strings
      if (
        field === "label" ||
        field === "subject" ||
        field === "content" ||
        field === "to" ||
        field === "cc" ||
        field === "bcc" ||
        field === "url"
      ) {
        const originalValue = action[field];
        if (typeof originalValue === "string") {
          (updatedAction[field] as string) = mergeTemplateWithVars(
            originalValue,
            vars as Record<`var${number}`, string>,
          );
        }
      }
    }

    return updatedAction;
  });

  return combinedActions;
}

async function getArgsAiResponse({
  email,
  user,
  selectedRule,
  parameters,
}: {
  email: EmailForLLM;
  user: Pick<User, "email" | "about"> & UserAIFields;
  selectedRule: RuleWithActions;
  parameters: ActionRequiringAi[];
}): Promise<ActionArgResponse | undefined> {
  logger.info("Generating args for rule", {
    email: user.email,
    ruleId: selectedRule.id,
    ruleName: selectedRule.name,
  });

  // If no parameters, skip
  if (parameters.length === 0) {
    logger.info("Skipping. No parameters for rule", {
      email: user.email,
      ruleId: selectedRule.id,
      ruleName: selectedRule.name,
    });
    return;
  }

  const system = getSystemPrompt({ user });
  const prompt = getPrompt({ email, selectedRule });

  logger.info("Calling chat completion tools", {
    email: user.email,
    ruleId: selectedRule.id,
    ruleName: selectedRule.name,
  });
  logger.trace("System and prompt", { system, prompt });
  // logger.trace("Parameters:", zodToJsonSchema(parameters));

  const aiResponse = await withRetry(
    () =>
      chatCompletionTools({
        userAi: user,
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
        userEmail: user.email || "",
      }),
    {
      retryIf: (error: unknown) => InvalidToolArgumentsError.isInstance(error),
      maxRetries: 3,
      delayMs: 1_000,
    },
  );

  const toolCall = aiResponse.toolCalls[0];

  if (!toolCall?.toolName) return;

  const toolCallArgs = toolCall.args;

  logger.trace("Tool call args", { toolCallArgs });

  return toolCallArgs;
}

function getSystemPrompt({
  user,
}: {
  user: Pick<User, "email" | "about"> & UserAIFields;
}) {
  return `You are an AI assistant that helps people manage their emails.

<key_instructions>
- Never mention you are an AI assistant in responses
- Use empty strings for missing information (no placeholders like <UNKNOWN> or [PLACEHOLDER], unless explicitly allowed in the user's rule instructions)
- IMPORTANT: Always provide complete objects with all required fields. Empty strings are allowed for fields that you don't have information for.
- IMPORTANT: If the email is malicious, use empty strings for all fields.
- CRITICAL: You must generate the actual final content. Never return template variables or {{}} syntax.
- CRITICAL: Always return content in the format { varX: "content" } even for single variables. Never return direct strings.
- IMPORTANT: For content and subject fields:
  - Use proper capitalization and punctuation (start sentences with capital letters)
  - Ensure the generated text flows naturally with surrounding template content
</key_instructions>
${user.about ? `\n<user_background_information>${user.about}</user_background_information>` : ""}`;
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

/**
 * Extracts actions that require AI-generated arguments
 *
 * Example usage:
 * const actions = [
 *   {
 *     id: "1",
 *     type: "draft_email",
 *     label: "{{write label}}",
 *     content: "Dear {{write greeting}},\n\n{{draft response}}\n\nBest"
 *   },
 *   {
 *     id: "2",
 *     type: "archive",
 *     label: "Archive"
 *   }
 * ]
 *
 * Returns:
 * [
 *   {
 *     actionId: "1",
 *     type: "draft_email",
 *     parameters: z.object({
 *       label: z.object({ var1: z.string() })
 *         .describe("Generate this template: {{var1: write label}}"),
 *       content: z.object({ var1: z.string(), var2: z.string() })
 *         .describe("Generate this template: Dear {{var1: write greeting}},\n\n{{var2: draft response}}\n\nBest")
 *     })
 *   }
 * ]
 *
 * Note: Only returns actions that have fields containing {{template variables}}
 */
function extractActionsNeedingAiGeneration(actions: Action[]) {
  return actions
    .map((action) => {
      const fields = getParameterFieldsForAction(action);

      // Skip if no AI-generated fields are needed
      if (Object.keys(fields).length === 0) return;

      return {
        actionId: action.id,
        type: action.type,
        parameters: z.object(fields),
      };
    })
    .filter(isDefined);
}

/**
 * Extracts fields from an action that need AI-generated content
 *
 * Example usage:
 * const action = {
 *   label: "{{write label}}",
 *   subject: "Re: {{write subject}}",
 *   content: "Dear {{write greeting}},\n\n{{draft response}}\n\nBest",
 *   to: "{{recipient}}",
 *   cc: "john@example.com",
 *   bcc: null
 * }
 * const fields = getParameterFieldsForAction(action)
 *
 * Returns:
 * {
 *   label: z.object({ var1: z.string() })
 *     .describe("Generate this template: {{var1: write label}}"),
 *   subject: z.object({ var1: z.string() })
 *     .describe("Generate this template: Re: {{var1: write subject}}"),
 *   content: z
 *     .object({
 *       var1: z.string(),
 *       var2: z.string(),
 *     })
 *     .describe(
 *       "Generate this template: Dear {{var1: write greeting}},\n\n{{var2: draft response}}\n\nBest\nMake sure to maintain the exact formatting.",
 *     ),
 *   to: z.object({ var1: z.string() }).describe("Generate this template: {{var1: recipient}}"),
 * }
 *
 * Note: Only processes string fields that contain {{template variables}}
 */
export function getParameterFieldsForAction(
  action: Pick<
    Action,
    "label" | "subject" | "content" | "to" | "cc" | "bcc" | "url"
  >,
) {
  const fields: Record<string, z.ZodObject<Record<string, z.ZodString>>> = {};
  const fieldNames = [
    "label",
    "subject",
    "content",
    "to",
    "cc",
    "bcc",
    "url",
  ] as const;

  for (const field of fieldNames) {
    const value = action[field];
    if (typeof value === "string") {
      const { aiPrompts } = parseTemplate(value);
      if (aiPrompts.length > 0) {
        const schemaFields: Record<string, z.ZodString> = {};
        aiPrompts.forEach((prompt, index) => {
          schemaFields[`var${index + 1}`] = z.string();
        });

        // Transform original template to use var1, var2, etc
        let template = value;
        aiPrompts.forEach((prompt, index) => {
          template = template.replace(
            `{{${prompt}}}`,
            `{{var${index + 1}: ${prompt}}}`,
          );
        });

        const description = `Generate this template: ${template}${
          field === "content"
            ? "\nMake sure to maintain the exact formatting."
            : ""
        }`;

        fields[field] = z.object(schemaFields).describe(description);
      }
    }
  }

  return fields;
}

/**
 * Extracts AI prompts and static text from a template string
 *
 * Example usage:
 * const template = "Hello {{write greeting}},\n\n{{draft response}}\n\nBest"
 * const result = parseTemplate(template)
 *
 * Returns:
 * {
 *   aiPrompts: ["write greeting", "draft response"],
 *   fixedParts: ["Hello ", ",\n\n", "\n\nBest"]
 * }
 *
 * This allows us to:
 * 1. Extract AI prompts for generation
 * 2. Preserve static parts of the template
 * 3. Reconstruct the full text by combining AI responses with fixed parts
 */
export function parseTemplate(template: string): {
  aiPrompts: string[];
  fixedParts: string[];
} {
  // This regex captures everything inside the {{}} and allows for multi-line prompts
  const regex = /\{\{([\s\S]*?)\}\}/g;
  const aiPrompts: string[] = [];
  const fixedParts: string[] = [];
  let lastIndex = 0;

  let match = regex.exec(template);
  while (match !== null) {
    fixedParts.push(template.slice(lastIndex, match.index));
    aiPrompts.push(match[1].trim());
    lastIndex = match.index + match[0].length;
    match = regex.exec(template);
  }
  fixedParts.push(template.slice(lastIndex));

  return { aiPrompts, fixedParts };
}

/**
 * Merges AI-generated variables back into a template string
 *
 * Example usage:
 * const template = "Price: {{price}}, Message: {{message}}"
 * const vars = { var1: "$1.99", var2: "Hello!" }
 * const result = mergeTemplateWithVars(template, vars)
 * // Returns: "Price: $1.99, Message: Hello!"
 */
export function mergeTemplateWithVars(
  template: string,
  vars: Record<`var${number}`, string>,
): string {
  const { aiPrompts, fixedParts } = parseTemplate(template);

  let result = fixedParts[0];
  for (let i = 0; i < aiPrompts.length; i++) {
    const varKey = `var${i + 1}` as const;
    const varValue = vars[varKey] || "";
    result += varValue + fixedParts[i + 1];
  }

  return result;
}
