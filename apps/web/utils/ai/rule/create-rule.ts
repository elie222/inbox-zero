import type { z } from "zod";
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

  const result = aiResponse.toolCalls[0].args as z.infer<
    typeof createRuleSchema
  >;

  return {
    ...result,
    actions: result.actions.map((action) => ({
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
  };
}
