import { z } from "zod";
import { chatCompletionTools } from "@/utils/llms";
import type { UserAIFields } from "@/utils/llms/types";
import { createRuleSchema } from "@/utils/ai/rule/create-rule-schema";

const updateRuleSchema = createRuleSchema.extend({
  ruleId: z.string().optional(),
});

export async function aiPromptToRules({
  user,
  promptFile,
  isEditing,
}: {
  user: UserAIFields & { email: string };
  promptFile: string;
  isEditing: boolean;
}) {
  const schema = isEditing ? updateRuleSchema : createRuleSchema;

  const parameters = z.object({
    rules: z
      .array(schema)
      .describe("The parsed rules list from the prompt file"),
  });

  const system =
    "You are an AI assistant that converts email management rules into a structured format. Parse the given prompt file and conver them into rules.";
  const prompt = `Convert the following prompt file into rules: ${promptFile}`;

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

  return parsedRules.rules.map((rule) => ({
    ...rule,
    actions: rule.actions.map((action) => ({
      type: action.type,
      // static
      label: action.static?.label ?? undefined,
      to: action.static?.to ?? undefined,
      cc: action.static?.cc ?? undefined,
      bcc: action.static?.bcc ?? undefined,
      subject: action.static?.subject ?? undefined,
      content: action.static?.content ?? undefined,
      // ai
      labelPrompt: action.aiPrompts?.label ?? undefined,
      toPrompt: action.aiPrompts?.to ?? undefined,
      ccPrompt: action.aiPrompts?.cc ?? undefined,
      bccPrompt: action.aiPrompts?.bcc ?? undefined,
      subjectPrompt: action.aiPrompts?.subject ?? undefined,
      contentPrompt: action.aiPrompts?.content ?? undefined,
    })),
  }));
}
