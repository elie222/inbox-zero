import { z } from "zod";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { stringifyEmail } from "@/utils/stringify-email";
import { isDefined, type EmailForLLM } from "@/utils/types";
import { getModel, type ModelType } from "@/utils/llms/model";
import { createGenerateObject } from "@/utils/llms";
import {
  appendOllamaOnlySystemGuidance,
  isOllamaProvider,
} from "@/utils/llms/ollama-guidance";
import { getUserInfoPrompt, getUserRulesPrompt } from "@/utils/ai/helpers";
import { sortRulesByCanonicalOrder } from "@/utils/rule/sort";
import type { Logger } from "@/utils/logger";
import type { ClassificationFeedbackItem } from "@/utils/rule/classification-feedback";

type GetAiResponseOptions = {
  email: EmailForLLM;
  emailAccount: EmailAccountWithAI;
  rules: {
    selectionId: string;
    name: string;
    instructions: string;
    systemType?: string | null;
  }[];
  modelType?: ModelType;
  classificationFeedback?: ClassificationFeedbackItem[] | null;
};

export async function aiChooseRule<
  T extends { name: string; instructions: string; systemType?: string | null },
>({
  email,
  rules,
  emailAccount,
  modelType,
  logger,
  classificationFeedback,
}: {
  email: EmailForLLM;
  rules: T[];
  emailAccount: EmailAccountWithAI;
  modelType?: ModelType;
  logger: Logger;
  classificationFeedback?: ClassificationFeedbackItem[] | null;
}): Promise<{
  rules: { rule: T; isPrimary?: boolean }[];
  reason: string;
}> {
  if (!rules.length) return { rules: [], reason: "No rules to evaluate" };

  const orderedRules = sortRulesByCanonicalOrder(rules);
  // Schema values bypass prompt redaction, so only generated IDs belong there.
  const rulesById = new Map(
    orderedRules.map((rule, index) => [`rule-${index + 1}`, rule] as const),
  );
  const offeredRules = Array.from(rulesById, ([selectionId, rule]) => ({
    ...rule,
    selectionId,
  }));

  const { result: aiResponse } = await getAiResponse({
    email,
    rules: offeredRules,
    emailAccount,
    modelType,
    classificationFeedback,
  });

  const rulesWithMetadata = aiResponse.matchedRules
    .map((match) => {
      if (!match.ruleId) return;
      const rule = rulesById.get(match.ruleId);
      return rule ? { rule, isPrimary: match.isPrimary } : undefined;
    })
    .filter(isDefined);

  logAiChooseRuleResult({
    aiResponse,
    logger,
    rulesById,
    rulesWithMetadata,
  });

  if (aiResponse.noMatchFound) {
    return {
      rules: [],
      reason: aiResponse.reasoning || "AI determined no rules matched",
    };
  }

  // A claimed match must resolve to an offered ID rather than silently
  // recording the email as skipped.
  if (!rulesWithMetadata.length) {
    throw new Error(
      `AI rule selection claimed a match but did not resolve to any offered rule (returned ${aiResponse.matchedRules.length} rule ID(s) for ${orderedRules.length} candidate(s))`,
    );
  }

  return {
    rules: rulesWithMetadata,
    reason: aiResponse.reasoning,
  };
}

async function getAiResponse(options: GetAiResponseOptions): Promise<{
  result: {
    matchedRules: { ruleId: string; isPrimary?: boolean }[];
    reasoning: string;
    noMatchFound: boolean;
  };
  modelOptions: ReturnType<typeof getModel>;
}> {
  const {
    email,
    emailAccount,
    rules,
    modelType = "default",
    classificationFeedback,
  } = options;

  const modelOptions = getModel(emailAccount.user, modelType);

  const generateObject = createGenerateObject({
    emailAccount,
    label: "Choose rule",
    modelOptions,
    promptHardening: { trust: "untrusted", level: "full" },
    cacheSystemPrompt: true,
  });

  if (shouldSelectMultipleRules({ rules, emailAccount })) {
    const result = await getAiResponseMultiRule({
      email,
      emailAccount,
      rules,
      modelOptions,
      generateObject,
      classificationFeedback,
    });

    return { result, modelOptions };
  } else {
    return getAiResponseSingleRule({
      email,
      emailAccount,
      rules,
      modelOptions,
      generateObject,
      classificationFeedback,
    });
  }
}

async function getAiResponseSingleRule({
  email,
  emailAccount,
  rules,
  modelOptions,
  generateObject,
  classificationFeedback,
}: {
  email: EmailForLLM;
  emailAccount: EmailAccountWithAI;
  rules: GetAiResponseOptions["rules"];
  modelOptions: ReturnType<typeof getModel>;
  generateObject: ReturnType<typeof createGenerateObject>;
  classificationFeedback?: ClassificationFeedbackItem[] | null;
}) {
  const system = `You are an AI assistant that helps people manage their emails.

<instructions>
  IMPORTANT: Follow these instructions carefully when selecting a rule:

  <priority>
  1. Match the email to a SPECIFIC user-defined rule that addresses the email's exact content or purpose.
  2. If the email doesn't match any specific rule but the user has a catch-all rule (like "emails that don't match other criteria"), use that catch-all rule.
  3. Only set "noMatchFound" to true if no user-defined rule can reasonably apply.
  4. Be concise in your reasoning - avoid repetitive explanations.
  5. Return the rule ID from the list below.
  </priority>

  <guidelines>
  - If a rule says to exclude certain types of emails, DO NOT select that rule for those excluded emails.
  - When multiple rules match, choose the more specific one that best matches the email's content.
  - Rules about requiring replies should be prioritized when the email clearly needs a response.
  ${METADATA_GUIDELINE}
  </guidelines>
</instructions>

${getUserRulesPrompt({ rules })}

${getUserInfoPrompt({ emailAccount })}

Respond with a valid JSON object:

Example response format:
{
  "reasoning": "This email is a newsletter subscription",
  "ruleId": "rule-1",
  "noMatchFound": false
}`;

  const prompt = `Select a rule to apply to this email that was sent to me:

<email>
${stringifyEmail(email, 500)}
</email>${email.listUnsubscribe ? "\nNote: This email has a List-Unsubscribe header." : ""}${appendClassificationFeedback(classificationFeedback)}`;

  const aiResponse = await generateObject({
    ...modelOptions,
    instructions: system,
    prompt,
    schema: z.object({
      reasoning: z
        .string()
        .describe("The reason you chose the rule. Keep it concise"),
      ruleId: z
        .enum(rules.map((rule) => rule.selectionId))
        .nullable()
        .describe("The ID of the rule you want to apply"),
      noMatchFound: z
        .boolean()
        .describe("True if no match was found, false otherwise"),
    }),
  });

  const hasRuleId = !!aiResponse.object?.ruleId;

  return {
    result: {
      matchedRules:
        hasRuleId && aiResponse.object.ruleId
          ? [{ ruleId: aiResponse.object.ruleId, isPrimary: true }]
          : [],
      noMatchFound: aiResponse.object?.noMatchFound ?? !hasRuleId,
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
  classificationFeedback,
}: {
  email: EmailForLLM;
  emailAccount: EmailAccountWithAI;
  rules: GetAiResponseOptions["rules"];
  modelOptions: ReturnType<typeof getModel>;
  generateObject: ReturnType<typeof createGenerateObject>;
  classificationFeedback?: ClassificationFeedbackItem[] | null;
}) {
  const rulesSection = rules
    .map(
      (rule) =>
        `<rule>\n<id>${rule.selectionId}</id>\n<name>${rule.name}</name>\n<instructions>${rule.instructions}</instructions>\n</rule>`,
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
  ${METADATA_GUIDELINE}
  </guidelines>
</instructions>

<available_rules>
${rulesSection}
</available_rules>

${getUserInfoPrompt({ emailAccount })}

Respond with a valid JSON object:

Example response format (single rule):
{
  "matchedRules": [{ "ruleId": "rule-1", "isPrimary": true }],
  "noMatchFound": false,
  "reasoning": "This is a newsletter subscription"
}

Example response format (multiple rules):
{
  "matchedRules": [
    { "ruleId": "rule-1", "isPrimary": true },
    { "ruleId": "rule-2", "isPrimary": false }
  ],
  "noMatchFound": false,
  "reasoning": "This email requires a response and is from a team member"
}`;

  const prompt = `Select all rules that apply to this email that was sent to me:

<email>
${stringifyEmail(email, 500)}
</email>${email.listUnsubscribe ? "\nNote: This email has a List-Unsubscribe header." : ""}${appendClassificationFeedback(classificationFeedback)}`;

  const aiResponse = await generateObject({
    ...modelOptions,
    instructions: appendOllamaOnlySystemGuidance(
      { instructions: system },
      modelOptions,
      OLLAMA_MULTI_RULE_SELECTION_GUIDANCE,
    ).instructions,
    prompt,
    schema: z.object({
      matchedRules: z
        .array(
          z.object({
            ruleId: z
              .enum(rules.map((rule) => rule.selectionId))
              .describe("The ID of the rule"),
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

  const response = {
    matchedRules: aiResponse.object.matchedRules || [],
    noMatchFound: aiResponse.object?.noMatchFound ?? false,
    reasoning: aiResponse.object?.reasoning ?? "",
  };

  if (isOllamaProvider(modelOptions.provider)) {
    const primaryRule = response.matchedRules.find((rule) => rule.isPrimary);
    if (primaryRule) return { ...response, matchedRules: [primaryRule] };
  }

  return response;
}

const METADATA_GUIDELINE =
  "- Consider email metadata (e.g. List-Unsubscribe headers) alongside content.";

function logAiChooseRuleResult<
  T extends { name: string; systemType?: string | null },
>({
  aiResponse,
  logger,
  rulesById,
  rulesWithMetadata,
}: {
  aiResponse: {
    matchedRules: { ruleId: string; isPrimary?: boolean }[];
    reasoning: string;
    noMatchFound: boolean;
  };
  logger: Logger;
  rulesById: ReadonlyMap<string, T>;
  rulesWithMetadata: { rule: T; isPrimary?: boolean }[];
}) {
  const candidates = Array.from(rulesById.values());
  const returnedRuleIds = aiResponse.matchedRules
    .map((match) => match.ruleId)
    .filter(Boolean);
  const unresolvedRuleIds = returnedRuleIds.filter(
    (ruleId) => !rulesById.has(ruleId),
  );
  const logPayload = {
    candidateRuleCount: candidates.length,
    candidateSystemTypes: joinLogValues(
      candidates.map((rule) => rule.systemType ?? "custom"),
    ),
    returnedRuleCount: returnedRuleIds.length,
    returnedRuleIds: joinLogValues(returnedRuleIds),
    resolvedRuleCount: rulesWithMetadata.length,
    unresolvedRuleCount: unresolvedRuleIds.length,
    unresolvedRuleIds: joinLogValues(unresolvedRuleIds),
    noMatchFound: aiResponse.noMatchFound,
    reasoningPresent: !!aiResponse.reasoning,
  };
  if (rulesWithMetadata.length === 0) {
    logger.warn("AI choose rule returned no usable rule", logPayload);
  } else {
    logger.info("AI choose rule completed", logPayload);
  }
  if (aiResponse.reasoning)
    logger.trace("AI choose rule reasoning", {
      reasoning: aiResponse.reasoning,
    });
}

function joinLogValues(values: (string | null | undefined)[]) {
  return values.filter(isDefined).join(", ");
}

function formatClassificationFeedback(
  feedback: ClassificationFeedbackItem[] | null | undefined,
): string {
  if (!feedback?.length) return "";

  const lines = feedback.map((entry) => {
    const subject = entry.subject
      ? `"${entry.subject}"`
      : "(email no longer available)";
    if (entry.eventType === "LABEL_ADDED") {
      return `- ${subject} → ${entry.ruleName}`;
    }
    return `- ${subject} removed from ${entry.ruleName}`;
  });

  return `<classification_feedback>
User has manually classified emails from this sender into these rules:
${lines.join("\n")}
These are hints from past user actions. Still evaluate the current email on its own merits.
</classification_feedback>`;
}

// Per-sender feedback stays out of the system prompt so the prefix is cacheable.
function appendClassificationFeedback(
  feedback: ClassificationFeedbackItem[] | null | undefined,
): string {
  const formatted = formatClassificationFeedback(feedback);
  return formatted ? `\n\n${formatted}` : "";
}

const OLLAMA_MULTI_RULE_SELECTION_GUIDANCE = [
  "Do not be greedy. Only select secondary rules when they capture a separate, independently actionable purpose in the email.",
  "Select problem, alert, or action-needed rules only when the email actually describes a problem, risk, failed action, or required user action.",
  "When one specific transactional rule fully explains the email, do not also select a generic notification or account-update rule.",
  "Prefer one best rule when candidate rules refer to the same underlying event.",
] as const;

// Multiple rules only make sense when the user has custom rules to combine.
export function shouldSelectMultipleRules({
  rules,
  emailAccount,
}: {
  rules: { systemType?: string | null }[];
  emailAccount: Pick<EmailAccountWithAI, "multiRuleSelectionEnabled">;
}) {
  return (
    emailAccount.multiRuleSelectionEnabled &&
    rules.some((rule) => !rule.systemType)
  );
}
