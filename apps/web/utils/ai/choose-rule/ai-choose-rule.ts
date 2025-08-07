import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { stringifyEmail } from "@/utils/stringify-email";
import type { EmailForLLM } from "@/utils/types";
import { getModel, type ModelType } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";
// import { Braintrust } from "@/utils/braintrust";

// const braintrust = new Braintrust("choose-rule-2");

type GetAiResponseOptions = {
  email: EmailForLLM;
  emailAccount: EmailAccountWithAI;
  rules: { name: string; instructions: string }[];
  modelType?: ModelType;
};

async function getAiResponse(options: GetAiResponseOptions) {
  const { email, emailAccount, rules, modelType = "default" } = options;

  const emailSection = stringifyEmail(email, 500);

  const system = `You are an AI assistant that helps people manage their emails.

<instructions>
  IMPORTANT: Follow these instructions carefully when selecting a rule:

  <priority>
  1. Match the email to a SPECIFIC user-defined rule that addresses the email's exact content or purpose.
  2. If the email doesn't match any specific rule but the user has a catch-all rule (like "emails that don't match other criteria"), use that catch-all rule.
  3. Only set "noMatchFound" to true if no user-defined rule can reasonably apply.
  4. Be concise in your reasoning - avoid repetitive explanations.
  5. Provide only the exact rule name from the list below.
  </priority>

  <guidelines>
  - If a rule says to exclude certain types of emails, DO NOT select that rule for those excluded emails.
  - When multiple rules match, choose the more specific one that best matches the email's content.
  - Rules about requiring replies should be prioritized when the email clearly needs a response.
  </guidelines>
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
}

<outputFormat>
Respond with a valid JSON object with the following fields:
"reason" - the reason you chose that rule. Keep it concise.
"ruleName" - the exact name of the rule you want to apply
"noMatchFound" - true if no match was found, false otherwise
</outputFormat>`;

  const prompt = `Select a rule to apply to this email that was sent to me:

<email>
${emailSection}
</email>`;

  const modelOptions = getModel(emailAccount.user, modelType);

  const generateObject = createGenerateObject({
    userEmail: emailAccount.email,
    label: "Choose rule",
    modelOptions,
  });

  const aiResponse = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema: z.object({
      reason: z.string(),
      ruleName: z.string().nullish(),
      noMatchFound: z.boolean().nullish(),
    }),
  });

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
  modelType,
}: {
  email: EmailForLLM;
  rules: T[];
  emailAccount: EmailAccountWithAI;
  modelType?: ModelType;
}) {
  if (!rules.length) return { reason: "No rules" };

  const aiResponse = await getAiResponse({
    email,
    rules,
    emailAccount,
    modelType,
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
