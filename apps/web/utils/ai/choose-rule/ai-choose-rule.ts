import { z } from "zod";
import { UserAIFields } from "@/utils/llms/types";
import { parseJSON } from "@/utils/json";
import { saveAiUsage } from "@/utils/usage";
import { chatCompletion, getAiProviderAndModel } from "@/utils/llms";
import { User } from "@prisma/client";
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
  functions: { description?: string }[];
};

export async function getAiResponse(options: GetAiResponseOptions) {
  const { email, user, functions } = options;

  const messages = [
    {
      role: "system" as const,
      content: `You are an AI assistant that helps people manage their emails.
It's better not to act if you don't know how.

These are the rules you can select from:
${functions.map((f, i) => `${i + 1}. ${f.description}`).join("\n")}`,
    },
    ...(user.about
      ? [
          {
            role: "user" as const,
            content: `Some additional information the user has provided:\n\n${user.about}`,
          },
        ]
      : []),
    {
      role: "user" as const,
      content: `This email was received for processing. Select a rule to apply to it.
Respond with a JSON object with the following fields:
"rule" - the number of the rule you want to apply
"reason" - the reason you chose that rule

The email:

${stringifyEmail(email, 500)}`,
    },
  ];

  const { model, provider } = getAiProviderAndModel(
    user.aiProvider,
    user.aiModel,
  );
  const aiResponse = await chatCompletion(
    provider,
    model,
    user.openAIApiKey,
    messages,
    { jsonResponse: true },
  );

  if (aiResponse.usage) {
    await saveAiUsage({
      email: user.email || "",
      usage: aiResponse.usage,
      provider: user.aiProvider,
      model,
      label: "Choose rule",
    });
  }

  const responseSchema = z.object({
    rule: z.number(),
    reason: z.string().optional(),
  });

  if (!aiResponse.response) return;

  try {
    const result = responseSchema.parse(parseJSON(aiResponse.response));
    return result;
  } catch (error) {
    console.warn(
      "Error parsing data.\nResponse:",
      aiResponse?.response,
      "\nError:",
      error,
    );
    return;
  }
}
