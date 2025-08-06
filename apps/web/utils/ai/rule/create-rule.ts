import type { EmailAccountWithAI } from "@/utils/llms/types";
import {
  type CreateOrUpdateRuleSchemaWithCategories,
  createRuleSchema,
} from "@/utils/ai/rule/create-rule-schema";
import { createScopedLogger } from "@/utils/logger";
import { getModel } from "@/utils/llms/model";
import { generateObject } from "ai";
import { saveAiUsage } from "@/utils/usage";

const logger = createScopedLogger("ai-create-rule");

export async function aiCreateRule(
  instructions: string,
  emailAccount: EmailAccountWithAI,
): Promise<CreateOrUpdateRuleSchemaWithCategories> {
  const system =
    "You are an AI assistant that helps people manage their emails.";
  const prompt = `Generate a rule for these instructions:\n${instructions}`;

  // const aiResponse = await chatCompletionObject({
  //   userAi: emailAccount.user,
  //   prompt,
  //   system,
  //   schemaName: "Generate rule",
  //   schemaDescription: "Generate a rule to handle the email",
  //   schema: createRuleSchema,
  //   userEmail: emailAccount.email,
  //   usageLabel: "Categorize rule",
  // });

  const { provider, model, llmModel, providerOptions } = getModel(
    emailAccount.user,
  );

  const aiResponse = await generateObject({
    model: llmModel,
    system,
    prompt,
    schema: createRuleSchema,
    providerOptions,
  });

  if (aiResponse.usage) {
    await saveAiUsage({
      email: emailAccount.email,
      usage: aiResponse.usage,
      provider,
      model,
      label: "Categorize rule",
    });
  }

  const result = aiResponse.object;

  logger.trace("Result", { result });

  return result as CreateOrUpdateRuleSchemaWithCategories;
}
