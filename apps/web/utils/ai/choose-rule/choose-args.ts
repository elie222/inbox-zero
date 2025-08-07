import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { ModelType } from "@/utils/llms/model";
import { ActionType, type Action } from "@prisma/client";
import {
  type RuleWithActions,
  isDefined,
  type ParsedMessage,
} from "@/utils/types";
import { fetchMessagesAndGenerateDraft } from "@/utils/reply-tracker/generate-draft";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { aiGenerateArgs } from "@/utils/ai/choose-rule/ai-choose-args";
import { createScopedLogger } from "@/utils/logger";
import type { EmailProvider } from "@/utils/email/provider";

const logger = createScopedLogger("choose-args");

type ActionArgResponse = {
  [key: `${string}-${string}`]: {
    [field: string]: {
      [key: `var${number}`]: string;
    };
  };
};

export async function getActionItemsWithAiArgs({
  message,
  emailAccount,
  selectedRule,
  client,
  modelType,
}: {
  message: ParsedMessage;
  emailAccount: EmailAccountWithAI;
  selectedRule: RuleWithActions;
  client: EmailProvider;
  modelType: ModelType;
}): Promise<Action[]> {
  // Draft content is handled via its own AI call
  // We provide a lot more context to the AI to draft the content
  const draftEmailActions = selectedRule.actions.filter(
    (action) => action.type === ActionType.DRAFT_EMAIL && !action.content,
  );

  let draft: string | null = null;

  if (draftEmailActions.length) {
    try {
      draft = await fetchMessagesAndGenerateDraft(
        emailAccount,
        message.threadId,
        client,
      );
    } catch (error) {
      logger.error("Failed to generate draft", { error });
      // Continue without draft if generation fails
      draft = null;
    }
  }

  const parameters = extractActionsNeedingAiGeneration(selectedRule.actions);

  if (parameters.length === 0 && !draft) return selectedRule.actions;

  const result = await aiGenerateArgs({
    email: getEmailForLLM(message),
    emailAccount,
    selectedRule,
    parameters,
    modelType,
  });

  return combineActionsWithAiArgs(
    selectedRule.actions,
    result as ActionArgResponse,
    draft,
  );
}

function combineActionsWithAiArgs(
  actions: Action[],
  aiArgs: ActionArgResponse | undefined,
  draft: string | null = null,
): Action[] {
  if (!aiArgs && !draft) return actions;

  return actions.map((action) => {
    const updatedAction = { ...action };

    // Add draft content to DRAFT_EMAIL actions if available
    if (draft && action.type === ActionType.DRAFT_EMAIL) {
      updatedAction.content = draft;
    }

    // Process AI args if available
    const aiAction = aiArgs?.[`${action.type}-${action.id}`];
    if (!aiAction) return updatedAction;

    // Merge variables for each field that has AI-generated content
    for (const [field, vars] of Object.entries(aiAction)) {
      // Already handled above
      if (field === "content" && draft) continue;

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
        aiPrompts.forEach((_prompt, index) => {
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
