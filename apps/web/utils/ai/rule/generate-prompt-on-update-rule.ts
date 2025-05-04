import { z } from "zod";
import { chatCompletionObject } from "@/utils/llms";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";
import type { RuleWithRelations } from "./create-prompt-from-rule";
import { createPromptFromRule } from "./create-prompt-from-rule";

const logger = createScopedLogger("generate-prompt-on-update-rule");

const parameters = z.object({
  updatedPrompt: z
    .string()
    .describe("The updated prompt file with the rule updated"),
});

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
3. Return only the updated prompt file
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

  logger.trace("Input", { system, prompt });

  const aiResponse = await chatCompletionObject({
    userAi: emailAccount.user,
    prompt,
    system,
    schema: parameters,
    userEmail: emailAccount.email,
    usageLabel: "Update prompt on update rule",
  });

  const parsedResponse = aiResponse.object;

  logger.trace("Output", { updatedPrompt: parsedResponse.updatedPrompt });

  return parsedResponse.updatedPrompt;
}
