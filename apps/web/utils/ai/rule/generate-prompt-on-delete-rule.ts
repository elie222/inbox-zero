import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";
import type { RuleWithRelations } from "./create-prompt-from-rule";
import { createPromptFromRule } from "./create-prompt-from-rule";
import { getModel } from "@/utils/llms/model";
import { generateObject } from "ai";
import { saveAiUsage } from "@/utils/usage";

const logger = createScopedLogger("generate-prompt-on-delete-rule");

const parameters = z.object({
  updatedPrompt: z
    .string()
    .describe("The updated prompt file with the rule removed"),
});

export async function generatePromptOnDeleteRule({
  emailAccount,
  existingPrompt,
  deletedRule,
}: {
  emailAccount: EmailAccountWithAI;
  existingPrompt: string;
  deletedRule: RuleWithRelations;
}): Promise<string> {
  const deletedRulePrompt = createPromptFromRule(deletedRule);

  if (!existingPrompt) return "";
  if (!deletedRulePrompt) return "";

  const system =
    "You are an AI assistant that helps maintain email management rule prompts. Your task is to update an existing prompt file by removing a specific rule while maintaining the exact format and style.";

  const prompt = `Here is the current prompt file that defines email management rules:

<current_prompt>
${existingPrompt}
</current_prompt>

Please remove this rule from the prompt file:
<rule_to_delete>
${deletedRulePrompt}
</rule_to_delete>

<instructions>
1. Remove the specified rule from the prompt file
2. Maintain the exact same format and style as the original
3. Keep all other rules intact
4. Return only the updated prompt file
5. Ensure the output is properly formatted with consistent spacing and line breaks
6. If you cannot find the rule in the current prompt, return the current prompt as is
</instructions>`;

  logger.trace("Input", { system, prompt });

  // const aiResponse = await chatCompletionObject({
  //   userAi: emailAccount.user,
  //   prompt,
  //   system,
  //   schema: parameters,
  //   userEmail: emailAccount.email,
  //   usageLabel: "Update prompt on delete rule",
  // });

  const { provider, model, llmModel, providerOptions } = getModel(
    emailAccount.user,
  );

  const aiResponse = await generateObject({
    model: llmModel,
    system,
    prompt,
    schema: parameters,
    providerOptions,
  });

  if (aiResponse.usage) {
    await saveAiUsage({
      email: emailAccount.email,
      usage: aiResponse.usage,
      provider,
      model,
      label: "Update prompt on delete rule",
    });
  }

  const parsedResponse = aiResponse.object;

  logger.trace("Output", { updatedPrompt: parsedResponse.updatedPrompt });

  return parsedResponse.updatedPrompt;
}
