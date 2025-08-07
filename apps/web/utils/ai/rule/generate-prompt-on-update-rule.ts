import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { RuleWithRelations } from "./create-prompt-from-rule";
import { createPromptFromRule } from "./create-prompt-from-rule";
import { getModel } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";

export async function generatePromptOnUpdateRule({
  emailAccount,
  existingPrompt,
  currentRule,
  updatedRule,
}: {
  emailAccount: EmailAccountWithAI;
  existingPrompt: string;
  currentRule: RuleWithRelations;
  updatedRule: RuleWithRelations;
}): Promise<string> {
  const currentRulePrompt = createPromptFromRule(currentRule);
  const updatedRulePrompt = createPromptFromRule(updatedRule);

  if (!existingPrompt) return "";
  if (!updatedRulePrompt) return "";

  const system = `You are an AI assistant that helps maintain email management rule prompts.
Your task is to update an existing prompt file by modifying a specific rule while maintaining the exact format and style.

Requirements:
1. Maintain the exact same format and style as the original
2. Keep all other rules intact
3. Return only the updated prompt file in JSON format
4. Ensure the output is properly formatted with consistent spacing and line breaks
5. If you cannot find a similar rule in the current prompt, append the new rule at the end.`;

  const prompt = `Here is the current prompt file that defines email management rules:

<current_prompt>
${existingPrompt}
</current_prompt>

Please update the prompt file by updating the rule:
<current_rule>
${currentRulePrompt}
</current_rule>

<updated_rule>
${updatedRulePrompt}
</updated_rule>`;

  const modelOptions = getModel(emailAccount.user, "chat");

  const generateObject = createGenerateObject({
    userEmail: emailAccount.email,
    label: "Update prompt on update rule",
    modelOptions,
  });

  const aiResponse = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema: z.object({
      updatedPrompt: z
        .string()
        .describe("The updated prompt file with the rule updated"),
    }),
  });

  return aiResponse.object.updatedPrompt;
}
