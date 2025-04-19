import type { z } from "zod";
import type { UserEmailWithAI } from "@/utils/llms/types";
import { chatCompletionTools } from "@/utils/llms";
import { createRuleSchema } from "@/utils/ai/rule/create-rule-schema";

export async function aiCreateRule(
  instructions: string,
  user: UserEmailWithAI,
) {
  const system =
    "You are an AI assistant that helps people manage their emails.";
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
    userEmail: user.email,
    label: "Categorize rule",
  });

  const result = aiResponse.toolCalls[0].args as z.infer<
    typeof createRuleSchema
  >;

  return {
    ...result,
    actions: result.actions.map((action) => ({
      type: action.type,
      label: action.fields?.label ?? undefined,
      to: action.fields?.to ?? undefined,
      cc: action.fields?.cc ?? undefined,
      bcc: action.fields?.bcc ?? undefined,
      subject: action.fields?.subject ?? undefined,
      content: action.fields?.content ?? undefined,
      webhookUrl: action.fields?.webhookUrl ?? undefined,
    })),
  };
}
