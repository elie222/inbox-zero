import type { EmailAccountWithAI } from "@/utils/llms/types";
import { createRuleSchema } from "@/utils/ai/rule/create-rule-schema";
import { getModel } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";

export async function aiCreateRule(
  instructions: string,
  emailAccount: EmailAccountWithAI,
) {
  const system =
    "You are an AI assistant that helps people manage their emails. Generate a JSON response with the rule details.";
  const prompt = `Generate a rule for these instructions:
<instructions>
  ${instructions}
</instructions>`;

  const modelOptions = getModel(emailAccount.user);

  const generateObject = createGenerateObject({
    userEmail: emailAccount.email,
    label: "Categorize rule",
    modelOptions,
  });

  const aiResponse = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema: createRuleSchema,
  });

  return aiResponse.object;
}
