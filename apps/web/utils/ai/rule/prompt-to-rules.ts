import { z } from "zod";
import { chatCompletionTools } from "@/utils/llms";
import type { UserAIFields } from "@/utils/llms/types";
import {
  createRuleSchema,
  createRuleSchemaWithCategories,
} from "@/utils/ai/rule/create-rule-schema";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("ai-prompt-to-rules");

const updateRuleSchema = createRuleSchema.extend({
  ruleId: z.string().optional(),
});
const updateRuleSchemaWithCategories = createRuleSchemaWithCategories.extend({
  ruleId: z.string().optional(),
});

export async function aiPromptToRules({
  user,
  promptFile,
  isEditing,
  hasSmartCategories,
}: {
  user: UserAIFields & { email: string };
  promptFile: string;
  isEditing: boolean;
  hasSmartCategories: boolean;
}) {
  function getSchema() {
    if (hasSmartCategories)
      return isEditing
        ? updateRuleSchemaWithCategories
        : createRuleSchemaWithCategories;
    return isEditing ? updateRuleSchema : createRuleSchema;
  }

  const schema = getSchema();

  const parameters = z.object({
    rules: z
      .array(schema)
      .describe("The parsed rules list from the prompt file"),
  });

  const system =
    "You are an AI assistant that converts email management rules into a structured format. Parse the given prompt file and conver them into rules.";
  const prompt = `Convert the following prompt file into rules:
  
<prompt>
${promptFile}
</prompt>

IMPORTANT: If a user provides a snippet, use that full snippet in the rule. Don't include placeholders unless it's clear one is needed.`;

  logger.trace("prompt-to-rules", { system, prompt });

  const aiResponse = await chatCompletionTools({
    userAi: user,
    prompt,
    system,
    tools: {
      parse_rules: {
        description: "Parse rules from prompt file",
        parameters,
      },
    },
    userEmail: user.email,
    label: "Prompt to rules",
  });

  const parsedRules = aiResponse.toolCalls[0].args as {
    rules: z.infer<typeof updateRuleSchema>[];
  };

  logger.trace("prompt-to-rules", { parsedRules });

  return parsedRules.rules.map((rule) => ({
    ...rule,
    actions: rule.actions.map((action) => ({
      type: action.type,
      label: action.fields?.label ?? undefined,
      to: action.fields?.to ?? undefined,
      cc: action.fields?.cc ?? undefined,
      bcc: action.fields?.bcc ?? undefined,
      subject: action.fields?.subject ?? undefined,
      content: action.fields?.content ?? undefined,
      webhookUrl: action.fields?.webhookUrl ?? undefined,
    })),
  }));
}
