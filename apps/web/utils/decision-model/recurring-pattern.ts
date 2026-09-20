import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import type { EmailForLLM } from "@/utils/types";
import {
  type DecisionModelConfig,
  type DecisionQuestion,
  runDecisionModel,
} from "./decision-model";
import { getDecisionEmailState } from "./email-state";

const RULE_KEY_PREFIX = "rule_";
const MIN_PATTERN_PROBABILITY = 0.9;
const MAX_PATTERN_SAMPLE_EMAILS = 10;

export async function decideRecurringPattern({
  config,
  emails,
  emailAccount,
  rules,
  consistentRuleName,
  logger,
}: {
  config: DecisionModelConfig;
  emails: EmailForLLM[];
  emailAccount: EmailAccountWithAI;
  rules: { name: string; instructions: string }[];
  consistentRuleName?: string;
  logger: Logger;
}): Promise<{ matchedRule: string | null; explanation: string }> {
  const candidateRules = consistentRuleName
    ? rules.filter((rule) => rule.name === consistentRuleName)
    : rules;
  if (candidateRules.length === 0) {
    return {
      matchedRule: null,
      explanation: "No eligible rule was available for pattern matching.",
    };
  }

  const questions: Record<string, DecisionQuestion> = Object.fromEntries(
    candidateRules.map((_rule, index) => [
      `${RULE_KEY_PREFIX}${index}`,
      {
        type: "yesNo",
        instructions: `Will future emails from \`sender\` consistently match \`candidateRules[${index}]\` based on \`sampleEmails\`?`,
        criteria: {
          true: "The sampled emails consistently serve one narrow purpose that clearly matches this rule.",
          false:
            "The samples vary in purpose, do not clearly match this rule, or come from a personal or general-purpose sender.",
        },
      },
    ]),
  );

  const response = await runDecisionModel({
    config,
    emailAccount,
    state: {
      sender: emails[0]?.from,
      accountOwner: {
        email: emailAccount.email,
        about: emailAccount.about || null,
      },
      sampleEmails: emails
        .slice(-MAX_PATTERN_SAMPLE_EMAILS)
        .map((email) => getDecisionEmailState(email, 500)),
      candidateRules,
    },
    questions,
    label: "Detect recurring pattern",
    logger,
  });

  const bestMatch = candidateRules
    .map((rule, index) => {
      const answer = response.answers[`${RULE_KEY_PREFIX}${index}`];
      return {
        rule,
        probability: answer?.type === "yesNo" ? answer.probability : 0,
      };
    })
    .sort((a, b) => b.probability - a.probability)[0];

  if (!bestMatch || bestMatch.probability < MIN_PATTERN_PROBABILITY) {
    return {
      matchedRule: null,
      explanation: bestMatch
        ? `The strongest rule had ${Math.round(bestMatch.probability * 100)}% confidence, below the recurring-pattern threshold.`
        : "No rule cleared the recurring-pattern confidence threshold.",
    };
  }

  return {
    matchedRule: bestMatch.rule.name,
    explanation: `Decision model matched this sender to ${bestMatch.rule.name} with ${Math.round(bestMatch.probability * 100)}% confidence.`,
  };
}
