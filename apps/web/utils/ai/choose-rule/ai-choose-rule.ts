import { z } from "zod";
import type { UserAIFields } from "@/utils/llms/types";
import { saveAiUsage } from "@/utils/usage";
import { chatCompletionObject, getAiProviderAndModel } from "@/utils/llms";
import type { User } from "@prisma/client";
import { stringifyEmail } from "@/utils/ai/choose-rule/stringify-email";

type GetAiResponseOptions = {
  email: {
    from: string;
    subject: string;
    content: string;
    cc?: string;
    replyTo?: string;
  };
  user: Pick<User, "email" | "about"> & UserAIFields;
  rules: { instructions: string }[];
};

export async function getAiResponse(options: GetAiResponseOptions) {
  const { email, user, rules } = options;

  if (!rules.length) return;

  const rulesWithUnknownRule = [
    ...rules,
    {
      instructions:
        "None of the above rules or not enough information to make a decision.",
    },
  ];

  const system = `You are an AI assistant that helps people manage their emails.
It's better not to act if you don't know how.
  
These are the rules you can select from:
${rulesWithUnknownRule
  .map((rule, i) => `${i + 1}. ${rule.instructions}`)
  .join("\n")}

${
  user.about
    ? `Some additional information the user has provided:\n\n${user.about}`
    : ""
}
`;

  const prompt = `This email was received for processing. Select a rule to apply to it.
Respond with a JSON object with the following fields:
"rule" - the number of the rule you want to apply
"reason" - the reason you chose that rule

The email:

${stringifyEmail(email, 500)}
`;

  const { model, provider } = getAiProviderAndModel(
    user.aiProvider,
    user.aiModel,
  );
  const aiResponse = await chatCompletionObject({
    provider,
    model,
    apiKey: user.openAIApiKey,
    prompt,
    system,
    schema: z.object({
      rule: z.number(),
      reason: z.string(),
    }),
  });

  if (aiResponse.usage) {
    await saveAiUsage({
      email: user.email || "",
      usage: aiResponse.usage,
      provider: user.aiProvider,
      model,
      label: "Choose rule",
    });
  }

  return aiResponse.object;
}
