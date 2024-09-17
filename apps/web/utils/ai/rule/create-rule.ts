import { z } from "zod";
import type { UserAIFields } from "@/utils/llms/types";
import { chatCompletionTools } from "@/utils/llms";
import { createRuleSchema } from "@/utils/ai/rule/create-rule-schema";

export async function aiCreateRule(
  instructions: string,
  user: UserAIFields,
  userEmail: string,
) {
  const system = `You are an AI assistant that helps people manage their emails.`;
  const prompt = `Generate a rule for these instructions:\n${instructions}`;

  const aiResponse = await chatCompletionTools({
    userAi: user,
    prompt,
    system,
    tools: {
      categorize_rule: {
        description: "Generate a rule to handle the email",
        parameters: createRuleSchema,
      },
    },
    userEmail,
    label: "Categorize rule",
  });

  return aiResponse.toolCalls[0].args as z.infer<typeof createRuleSchema>;
}
