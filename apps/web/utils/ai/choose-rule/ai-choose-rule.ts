import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { stringifyEmail } from "@/utils/stringify-email";
import { isDefined, type EmailForLLM } from "@/utils/types";
import { getModel, type ModelType } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";
import { getUserInfoPrompt, getUserRulesPrompt } from "@/utils/ai/helpers";

type GetAiResponseOptions = {
  email: EmailForLLM;
  emailAccount: EmailAccountWithAI;
  rules: { name: string; instructions: string; systemType?: string | null }[];
  modelType?: ModelType;
};

export async function aiChooseRule<
  T extends { name: string; instructions: string; systemType?: string | null },
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
}): Promise<{
  rules: { rule: T; isPrimary?: boolean }[];
  reason: string;
}> {
  if (!rules.length) return { rules: [], reason: "No rules to evaluate" };

  const { result: aiResponse } = await getAiResponse({
    email,
    rules,
    emailAccount,
    modelType,
  });

  if (aiResponse.noMatchFound) {
    return {
      rules: [],
      reason: aiResponse.reasoning || "AI determined no rules matched",
    };
  }

  const rulesWithMetadata = aiResponse.matchedRules
    .map((match) => {
      const rule = rules.find(
        (r) => r.name.toLowerCase() === match.ruleName.toLowerCase(),
      );
      return rule ? { rule, isPrimary: match.isPrimary } : undefined;
    })
    .filter(isDefined);

  return {
    rules: rulesWithMetadata,
    reason: aiResponse.reasoning,
  };
}

async function getAiResponse(options: GetAiResponseOptions): Promise<{
  result: {
    matchedRules: { ruleName: string; isPrimary?: boolean }[];
    reasoning: string;
    noMatchFound: boolean;
  };
  modelOptions: ReturnType<typeof getModel>;
}> {
  const { email, emailAccount, rules, modelType = "default" } = options;

  const modelOptions = getModel(emailAccount.user, modelType);

  const generateObject = createGenerateObject({
    userEmail: emailAccount.email,
    label: "Choose rule",
    modelOptions,
  });

  const hasCustomRules = rules.some((rule) => !rule.systemType);

  if (hasCustomRules && emailAccount.multiRuleSelectionEnabled) {
    const result = await getAiResponseMultiRule({
      email,
      emailAccount,
      rules,
      modelOptions,
      generateObject,
    });

    return { result, modelOptions };
  } else {
    return getAiResponseSingleRule({
      email,
      emailAccount,
      rules,
      modelOptions,
      generateObject,
    });
  }
}

async function getAiResponseSingleRule({
  email,
  emailAccount,
  rules,
  modelOptions,
  generateObject,
}: {
  email: EmailForLLM;
  emailAccount: EmailAccountWithAI;
  rules: GetAiResponseOptions["rules"];
  modelOptions: ReturnType<typeof getModel>;
  generateObject: ReturnType<typeof createGenerateObject>;
}) {
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

${getUserRulesPrompt({ rules })}

${getUserInfoPrompt({ emailAccount })}

Respond with a valid JSON object:

Example response format:
{
  "reasoning": "This email is a newsletter subscription",
  "ruleName": "Newsletter",
  "noMatchFound": false
}`;

  const prompt = `Select a rule to apply to this email that was sent to me:

<email>
${stringifyEmail(email, 500)}
</email>`;

  const aiResponse = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema: z.object({
      reasoning: z
        .string()
        .describe("The reason you chose the rule. Keep it concise"),
      ruleName: z
        .string()
        .describe("The exact name of the rule you want to apply"),
      noMatchFound: z
        .boolean()
        .describe("True if no match was found, false otherwise"),
    }),
  });

  return {
    result: {
      matchedRules: aiResponse.object ? [aiResponse.object] : [],
      noMatchFound: aiResponse.object?.noMatchFound ?? false,
      reasoning: aiResponse.object?.reasoning,
    },
    modelOptions,
  };
}

async function getAiResponseMultiRule({
  email,
  emailAccount,
  rules,
  modelOptions,
  generateObject,
}: {
  email: EmailForLLM;
  emailAccount: EmailAccountWithAI;
  rules: GetAiResponseOptions["rules"];
  modelOptions: ReturnType<typeof getModel>;
  generateObject: ReturnType<typeof createGenerateObject>;
}) {
  const rulesSection = rules
    .map(
      (rule) =>
        `<rule>\n<name>${rule.name}</name>\n<instructions>${rule.instructions}</instructions>\n</rule>`,
    )
    .join("\n");

  const system = `You are an AI assistant that helps people manage their emails.

<instructions>
  IMPORTANT: Follow these instructions carefully when selecting rules:

  <priority>
  - Review all available rules and select those that genuinely match this email.
  - You can select multiple rules, but BE SELECTIVE - it's rare that you need to select more than 1-2 rules.
  - Only set "noMatchFound" to true if no rules can reasonably apply. There is usually a rule that matches.
  </priority>

  <isPrimary_field>
  - When returning multiple rules, mark ONLY ONE rule as the primary match (isPrimary: true).
  - The primary rule should be the MOST SPECIFIC rule that best matches the email's content and purpose.
  </isPrimary_field>

  <guidelines>
  - If a rule says to exclude certain types of emails, DO NOT select that rule for those excluded emails.
  - Do not be greedy - only select rules that add meaningful context.
  - Be concise in your reasoning - avoid repetitive explanations.
  </guidelines>
</instructions>

<available_rules>
${rulesSection}
</available_rules>

${getUserInfoPrompt({ emailAccount })}

Respond with a valid JSON object:

Example response format (single rule):
{
  "matchedRules": [{ "ruleName": "Newsletter", "isPrimary": true }],
  "noMatchFound": false,
  "reasoning": "This is a newsletter subscription"
}

Example response format (multiple rules):
{
  "matchedRules": [
    { "ruleName": "To Reply", "isPrimary": true },
    { "ruleName": "Team Emails", "isPrimary": false }
  ],
  "noMatchFound": false,
  "reasoning": "This email requires a response and is from a team member"
}`;

  const prompt = `Select all rules that apply to this email that was sent to me:

<email>
${stringifyEmail(email, 500)}
</email>`;

  const aiResponse = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema: z.object({
      matchedRules: z
        .array(
          z.object({
            ruleName: z.string().describe("The exact name of the rule"),
            isPrimary: z
              .boolean()
              .describe(
                "True if the rule is the primary match, false otherwise",
              ),
          }),
        )
        .describe("Array of all matching rules"),
      reasoning: z
        .string()
        .describe(
          "The reasoning you used to choose the rules. Keep it concise",
        ),
      noMatchFound: z
        .boolean()
        .describe("True if no match was found, false otherwise"),
    }),
  });

  return {
    matchedRules: aiResponse.object.matchedRules || [],
    noMatchFound: aiResponse.object?.noMatchFound ?? false,
    reasoning: aiResponse.object?.reasoning ?? "",
  };
}
