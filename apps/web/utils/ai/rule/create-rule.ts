import type { EmailAccountWithAI } from "@/utils/llms/types";
import {
  type CreateOrUpdateRuleSchemaWithCategories,
  createRuleSchema,
} from "@/utils/ai/rule/create-rule-schema";
import { getModel } from "@/utils/llms/model";
import { createGenerateText } from "@/utils/llms";

export async function aiCreateRule(
  instructions: string,
  emailAccount: EmailAccountWithAI,
): Promise<CreateOrUpdateRuleSchemaWithCategories> {
  const system =
    "You are an AI assistant that helps people manage their emails.";
  const prompt = `Generate a rule for these instructions:\n${instructions}`;

  const modelOptions = getModel(emailAccount.user);

  const generateText = createGenerateText({
    userEmail: emailAccount.email,
    label: "Categorize rule",
    modelOptions,
  });

  const aiResponse = await generateText({
    ...modelOptions,
    system,
    prompt,
    tools: {
      generate_rule: {
        description: "Generate a rule to handle the email",
        parameters: createRuleSchema,
      },
    },
  });

  return aiResponse.toolCalls?.[0]
    ?.input as CreateOrUpdateRuleSchemaWithCategories;
}
