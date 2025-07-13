import type { EmailAccountWithAI } from "@/utils/llms/types";
import { chatCompletionTools } from "@/utils/llms";
import {
  type CreateOrUpdateRuleSchemaWithCategories,
  type CreateRuleSchema,
  createRuleSchema,
} from "@/utils/ai/rule/create-rule-schema";

export async function aiCreateRule(
  instructions: string,
  emailAccount: EmailAccountWithAI,
): Promise<CreateOrUpdateRuleSchemaWithCategories> {
  const system =
    "You are an AI assistant that helps people manage their emails.";
  const prompt = `Generate a rule for these instructions:\n${instructions}`;

  const aiResponse = await chatCompletionTools({
    userAi: emailAccount.user,
    prompt,
    system,
    tools: {
      generate_rule: {
        description: "Generate a rule to handle the email",
        parameters: createRuleSchema,
      },
    },
    userEmail: emailAccount.email,
    label: "Categorize rule",
  });

  const result = aiResponse.toolCalls[0]?.args as CreateRuleSchema;

  return result;
}
