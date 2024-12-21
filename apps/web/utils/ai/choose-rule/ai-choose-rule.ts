import { z } from "zod";
import type { UserAIFields } from "@/utils/llms/types";
import { chatCompletionObject } from "@/utils/llms";
import type { User } from "@prisma/client";
import { stringifyEmail } from "@/utils/ai/choose-rule/stringify-email";
import type { EmailForLLM } from "@/utils/ai/choose-rule/stringify-email";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("ai-choose-rule");

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

async function getAiResponse(options: GetAiResponseOptions) {
  const { email, user, rules } = options;

  const rulesWithUnknownRule = [
    ...rules,
    {
      instructions:
        "None of the other rules match or not enough information to make a decision.",
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

  const prompt = `An email was received for processing. Select a rule to apply to it.

<outputFormat>
Respond with a JSON object with the following fields:
"reason" - the reason you chose that rule. Keep it concise.
"rule" - the number of the rule you want to apply
</outputFormat>

<email>
${stringifyEmail(email, 700)}
</email>
`;

  logger.trace("AI choose rule prompt", { system, prompt });

  const aiResponse = await chatCompletionObject({
    userAi: user,
    prompt,
    system,
    schema: z.object({
      reason: z.string(),
      rule: z.number(),
    }),
    userEmail: user.email || "",
    usageLabel: "Choose rule",
  });

  logger.trace("AI choose rule response", aiResponse.object);

  return aiResponse.object;
}

export async function aiChooseRule<
  T extends { instructions: string },
>(options: {
  email: EmailForLLM;
  rules: T[];
  user: Pick<User, "email" | "about"> & UserAIFields;
}) {
  const { email, rules, user } = options;

  if (!rules.length) return { reason: "No rules" };

  const aiResponse = await getAiResponse({
    email,
    rules,
    user,
  });

  const ruleNumber = aiResponse ? aiResponse.rule - 1 : undefined;
  if (typeof ruleNumber !== "number") {
    console.warn("No rule selected");
    return { reason: aiResponse?.reason };
  }

  const selectedRule = rules[ruleNumber];

  return {
    rule: selectedRule,
    reason: aiResponse?.reason,
  };
}
