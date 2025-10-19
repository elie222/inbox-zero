import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { stringifyEmail } from "@/utils/stringify-email";
import { isDefined, type EmailForLLM } from "@/utils/types";
import { getModel, type ModelType } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";
import { createScopedLogger } from "@/utils/logger";
import { getUserInfoPrompt, getUserRulesPrompt } from "@/utils/ai/helpers";

const logger = createScopedLogger("AI Choose Rule");

type GetAiResponseOptions = {
  email: EmailForLLM;
  emailAccount: EmailAccountWithAI;
  rules: { name: string; instructions: string; systemType?: string | null }[];
  modelType?: ModelType;
};

async function getAiResponse(options: GetAiResponseOptions): Promise<{
  result: {
    matchedRules: {
      reason: string;
      ruleName: string;
    }[];
    noMatchFound: boolean;
  };
  modelOptions: ReturnType<typeof getModel>;
}> {
  const { email, emailAccount, rules, modelType = "default" } = options;

  const emailSection = stringifyEmail(email, 500);
  const hasCustomRules = rules.some((rule) => !rule.systemType);

  const modelOptions = getModel(emailAccount.user, modelType);
  const generateObject = createGenerateObject({
    userEmail: emailAccount.email,
    label: "Choose rule",
    modelOptions,
  });

  // Use different prompts based on whether custom rules exist
  if (hasCustomRules) {
    return getAiResponseMultiRule({
      email,
      emailSection,
      emailAccount,
      rules,
      modelOptions,
      generateObject,
    });
  } else {
    return getAiResponseSingleRule({
      emailSection,
      emailAccount,
      rules,
      modelOptions,
      generateObject,
    });
  }
}

// Original single-rule logic (proven, for users without custom rules)
async function getAiResponseSingleRule({
  emailSection,
  emailAccount,
  rules,
  modelOptions,
  generateObject,
}: {
  emailSection: string;
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
  "reason": "This email is a newsletter subscription",
  "ruleName": "Newsletter",
  "noMatchFound": false
}`;

  const prompt = `Select a rule to apply to this email that was sent to me:

<email>
${emailSection}
</email>`;

  const aiResponse = await generateObject({
    ...modelOptions,
    system,
    prompt,
    schema: z.object({
      reason: z
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
    },
    modelOptions,
  };
}

// New multi-rule logic (for users with custom rules)
async function getAiResponseMultiRule({
  email,
  emailSection,
  emailAccount,
  rules,
  modelOptions,
  generateObject,
}: {
  email: EmailForLLM;
  emailSection: string;
  emailAccount: EmailAccountWithAI;
  rules: GetAiResponseOptions["rules"];
  modelOptions: ReturnType<typeof getModel>;
  generateObject: ReturnType<typeof createGenerateObject>;
}) {
  const systemRules = rules.filter((rule) => rule.systemType);
  const customRules = rules.filter((rule) => !rule.systemType);

  // Build rules list with clear system vs custom distinction
  let rulesSection = "";
  if (systemRules.length > 0) {
    rulesSection += "\n<system_rules>\nSystem preset rules:\n\n";
    rulesSection += systemRules
      .map(
        (rule, idx) =>
          `${idx + 1}. ${rule.name}${rule.instructions ? `\n   Instructions: ${rule.instructions}` : ""}`,
      )
      .join("\n\n");
    rulesSection += "\n</system_rules>";
  }

  rulesSection += "\n\n<custom_rules>\nCustom user-defined rules:\n\n";
  rulesSection += customRules
    .map(
      (rule, idx) =>
        `${idx + 1}. ${rule.name}${rule.instructions ? `\n   Instructions: ${rule.instructions}` : ""}`,
    )
    .join("\n\n");
  rulesSection += "\n</custom_rules>";

  const system = `You are an AI assistant that helps people manage their emails.

<instructions>
  IMPORTANT: Follow these instructions carefully when selecting rules:

  <priority>
  - Review all available rules and select those that genuinely match this email.
  - You can select multiple rules, but BE SELECTIVE - it's rare that you need to select more than 1-2 rules.
  - Only set "noMatchFound" to true if no rules can reasonably apply. There is usually a rule that matches.
  </priority>

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
  "matchedRules": [
    {
      "ruleName": "Newsletter",
      "reason": "This is a newsletter subscription"
    }
  ],
  "noMatchFound": false
}

Example response format (multiple rules):
{
  "matchedRules": [
    {
      "ruleName": "To Reply",
      "reason": "This email requires a response"
    },
    {
      "ruleName": "Team Emails",
      "reason": "From a team member"
    }
  ],
  "noMatchFound": false
}`;

  const prompt = `Select all rules that apply to this email that was sent to me:

<email>
${emailSection}
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
            reason: z.string().describe("Why this rule matches"),
          }),
        )
        .describe("Array of all matching rules"),
      noMatchFound: z
        .boolean()
        .describe("True if no match was found, false otherwise"),
    }),
  });

  // Log when multiple system rules are selected
  const selectedSystemRules = aiResponse.object.matchedRules.filter((match) =>
    systemRules.some(
      (r) => r.name.toLowerCase() === match.ruleName.toLowerCase(),
    ),
  );

  if (selectedSystemRules.length > 1) {
    logger.warn("Multiple system rules selected", {
      systemRules: selectedSystemRules.map((r) => r.ruleName),
      emailId: email.id,
      model: modelOptions.modelName,
    });
  }

  if (aiResponse.object.matchedRules.length > 1) {
    logger.info("Multiple rules selected", {
      rules: aiResponse.object.matchedRules.map((r) => r.ruleName),
      emailId: email.id,
    });
  }

  return {
    result: {
      matchedRules: aiResponse.object.matchedRules || [],
      noMatchFound: aiResponse.object?.noMatchFound ?? false,
    },
    modelOptions,
  };
}

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
}): Promise<
  {
    rule: T;
    reason: string;
  }[]
> {
  if (!rules.length) return [];

  const { result: aiResponse } = await getAiResponse({
    email,
    rules,
    emailAccount,
    modelType,
  });

  if (aiResponse.noMatchFound) return [];

  const selectedRules = aiResponse.matchedRules
    .map((match) => {
      const rule = rules.find(
        (r) => r.name.toLowerCase() === match.ruleName.toLowerCase(),
      );
      return rule ? { rule, reason: match.reason } : undefined;
    })
    .filter(isDefined);

  return selectedRules;
}
