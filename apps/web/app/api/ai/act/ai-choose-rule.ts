import { z } from "zod";
import { UserAIFields } from "@/utils/llms/types";
import { ActBody } from "@/app/api/ai/act/validation";
import { parseJSON } from "@/utils/json";
import { saveAiUsage } from "@/utils/usage";
import { chatCompletion, getAiProviderAndModel } from "@/utils/llms";
import { User } from "@prisma/client";

// after some testing i see the AI performs better when it works on smaller tasks
// if we try ask it to select a rule, and provide the args for that rule in one go, it doesn't do as well
// so i've split this up into two ai calls:
// 1. select rule
// 2. generate args for rule

export async function getAiResponse(options: {
  email: Pick<ActBody["email"], "from" | "cc" | "replyTo" | "subject"> & {
    content: string;
    snippet: string;
  };
  user: Pick<User, "email" | "about"> & UserAIFields;
  functions: { description?: string }[];
}) {
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

From: ${email.from}
Reply to: ${email.replyTo}
CC: ${email.cc}
Subject: ${email.subject}
Body:
${email.snippet}`,
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
  // tools: [
  //   {
  //     type: "function",
  //     function: {
  //       name: "selectRule",
  //       description: "Select a rule to apply to the email.",
  //       parameters: {
  //         type: "object",
  //         properties: {
  //           ruleNumber: {
  //             type: "number",
  //             description: "The number of the rule to apply.",
  //           },
  //           reason: {
  //             type: "string",
  //             description: "The reason for choosing this rule.",
  //           },
  //         },
  //         required: ["ruleNumber"],
  //       },
  //     },
  //   },
  // ],

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
