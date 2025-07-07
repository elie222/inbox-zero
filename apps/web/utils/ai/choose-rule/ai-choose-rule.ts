import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { chatCompletionObject } from "@/utils/llms";
import { stringifyEmail } from "@/utils/stringify-email";
import type { EmailForLLM } from "@/utils/types";
import { createScopedLogger } from "@/utils/logger";
// import { Braintrust } from "@/utils/braintrust";

const logger = createScopedLogger("ai-choose-rule");

// const braintrust = new Braintrust("choose-rule-2");

type GetAiResponseOptions = {
  email: EmailForLLM;
  emailAccount: EmailAccountWithAI;
  rules: { name: string; instructions: string }[];
};

async function getAiResponse(options: GetAiResponseOptions) {
  const { email, emailAccount, rules } = options;

  const emailSection = stringifyEmail(email, 500);

  const system = `You are an AI assistant that helps people manage their emails.

<instructions>
  Follow these instructions carefully when selecting a rule:

  1. Match the email to a SPECIFIC user-defined rule that addresses the email's exact content or purpose.
  2. If the email doesn't match any specific rule but the user has a catch-all rule, use that catch-all rule.
  3. Only set "noMatchFound" to true if no user-defined rule can reasonably apply.
  4. Be concise in your reasoning - avoid repetitive explanations.
  5. Provide only the exact rule name from the list below.
</instructions>

<user_rules>
${rules
  .map(
    (rule) => `<rule>
  <name>${rule.name}</name>
  <criteria>${rule.instructions}</criteria>
</rule>`,
  )
  .join("\n")}
</user_rules>

${
  emailAccount.about
    ? `<user_info>
<about>${emailAccount.about}</about>
<email>${emailAccount.email}</email>
</user_info>`
    : `<user_info>
<email>${emailAccount.email}</email>
</user_info>`
}`;

  const prompt = `Select a rule to apply to this email that was sent to me:

<email>
${emailSection}
</email>

Respond with a JSON object containing: reason, ruleName, and noMatchFound.`;

  logger.trace("Input", { system, prompt });

  const aiResponse = await chatCompletionObject({
    userAi: emailAccount.user,
    messages: [
      {
        role: "system",
        content: system,
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    schema: z.object({
      reason: z.string(),
      ruleName: z.string().nullish(),
      noMatchFound: z.boolean().nullish(),
    }),
    userEmail: emailAccount.email,
    usageLabel: "Choose rule",
  });

  logger.trace("Response", aiResponse.object);

  // braintrust.insertToDataset({
  //   id: email.id,
  //   input: {
  //     email: emailSection,
  //     rules: rules.map((rule) => ({
  //       name: rule.name,
  //       instructions: rule.instructions,
  //     })),
  //     hasAbout: !!emailAccount.about,
  //     userAbout: emailAccount.about,
  //     userEmail: emailAccount.email,
  //   },
  //   expected: aiResponse.object.ruleName,
  // });

  return aiResponse.object;
}

export async function aiChooseRule<
  T extends { name: string; instructions: string },
>({
  email,
  rules,
  emailAccount,
}: {
  email: EmailForLLM;
  rules: T[];
  emailAccount: EmailAccountWithAI;
}) {
  if (!rules.length) return { reason: "No rules" };

  const aiResponse = await getAiResponse({
    email,
    rules,
    emailAccount,
  });

  if (aiResponse.noMatchFound)
    return { rule: undefined, reason: "No match found" };

  const selectedRule = aiResponse.ruleName
    ? rules.find(
        (rule) =>
          rule.name.toLowerCase() === aiResponse.ruleName?.toLowerCase(),
      )
    : undefined;

  return {
    rule: selectedRule,
    reason: aiResponse?.reason,
  };
}
