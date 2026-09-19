import type { Rule } from "@/generated/prisma/client";
import { shouldSelectMultipleRules } from "@/utils/ai/choose-rule/ai-choose-rule";
import {
  type ClassifierConfig,
  type ClassifierQuestion,
  classify,
} from "@/utils/classifier/classify";
import { DEFAULT_COLD_EMAIL_PROMPT } from "@/utils/cold-email/prompt";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import type { ClassificationFeedbackItem } from "@/utils/rule/classification-feedback";
import type { ParsedMessage } from "@/utils/types";

const MODULE = "classifier-choose-rule";

const COLD_EMAIL_KEY = "Cold Email";
const NONE_KEY = "None";
const NONE_DEFINITION = "None of the rules apply to this email";
const QUESTION =
  "Which rule best describes this email, from the point of view of the account owner?";
// Rule names become question keys, so the choice lives under a key no rule
// name can take.
const CHOICE_QUESTION_KEY = "__rule_choice__";
const RULE_APPLIES_QUESTION = "Does this rule apply to this email?";
const RULE_APPLIES_THRESHOLD = 0.5;
const EMAIL_CONTENT_MAX_LENGTH = 2000;

type RuleCandidate = {
  id: string;
  name: string;
  instructions: string;
  systemType?: string | null;
};

export async function classifierChooseRule<T extends RuleCandidate>({
  classifier,
  message,
  emailAccount,
  rules,
  coldEmailRule,
  classificationFeedback,
  logger: parentLogger,
}: {
  classifier: ClassifierConfig;
  message: ParsedMessage;
  emailAccount: EmailAccountWithAI;
  rules: T[];
  // Pass when the cold-email decision is still open so the classifier makes it too.
  coldEmailRule: Pick<Rule, "instructions"> | null;
  classificationFeedback: ClassificationFeedbackItem[] | null;
  logger: Logger;
}): Promise<{
  rules: { rule: T; isPrimary?: boolean }[];
  reason: string;
  isColdEmail: boolean;
}> {
  const logger = parentLogger.with({ module: MODULE });

  const { criteria, rulesByKey } = buildCriteria({ rules, coldEmailRule });

  // For multi-rule accounts, the choice picks the primary rule and a yes/no per
  // custom rule, in the same request, adds any others that also apply. System
  // rules are only ever primary, so at most one is selected.
  const selectMultiple = shouldSelectMultipleRules({ rules, emailAccount });
  const ruleAppliesQuestions: Record<string, ClassifierQuestion> =
    selectMultiple
      ? Object.fromEntries(
          [...rulesByKey]
            .filter(([, rule]) => !rule.systemType)
            .map(([key]) => [
              key,
              {
                type: "yesNo",
                instructions: {
                  question: RULE_APPLIES_QUESTION,
                  rule: criteria[key],
                },
              },
            ]),
        )
      : {};

  const res = await classify({
    config: classifier,
    emailAccount,
    state: buildState({ message, emailAccount, classificationFeedback }),
    questions: {
      ...ruleAppliesQuestions,
      [CHOICE_QUESTION_KEY]: {
        type: "choice",
        instructions: QUESTION,
        criteria,
      },
    },
    label: "Classifier rule selection",
    logger,
  });

  const answer = res.answers[CHOICE_QUESTION_KEY];
  if (answer?.type !== "choice") {
    throw new Error("Classifier response is missing the rule choice");
  }

  const ruleApplies = Object.fromEntries(
    Object.keys(ruleAppliesQuestions).map((key) => {
      const ruleAnswer = res.answers[key];
      return [key, ruleAnswer?.type === "yesNo" ? ruleAnswer.probability : 0];
    }),
  );

  logger.info("Classifier chose rule", {
    choice: answer.choice,
    confidence: answer.confidence,
    probabilities: answer.probabilities,
    ruleApplies,
    model: res.model,
    inputTokens: res.inputTokens,
  });

  const reason = `Classifier chose "${answer.choice}" (confidence ${answer.confidence.toFixed(2)})`;

  if (answer.choice === NONE_KEY)
    return { rules: [], reason, isColdEmail: false };
  if (answer.choice === COLD_EMAIL_KEY) {
    return { rules: [], reason, isColdEmail: true };
  }

  const primaryRule = rulesByKey.get(answer.choice);
  if (!primaryRule) {
    throw new Error("Classifier chose a rule that was not offered");
  }

  const additionalRules = [...rulesByKey]
    .filter(
      ([key, rule]) =>
        rule !== primaryRule && ruleApplies[key] >= RULE_APPLIES_THRESHOLD,
    )
    .map(([, rule]) => ({ rule, isPrimary: false }));

  return {
    rules: [{ rule: primaryRule, isPrimary: true }, ...additionalRules],
    reason,
    isColdEmail: false,
  };
}

function buildCriteria<T extends RuleCandidate>({
  rules,
  coldEmailRule,
}: {
  rules: T[];
  coldEmailRule: Pick<Rule, "instructions"> | null;
}) {
  const criteria: Record<string, string> = {};
  const rulesByKey = new Map<string, T>();
  const usedKeys = new Set<string>([
    NONE_KEY.toLowerCase(),
    COLD_EMAIL_KEY.toLowerCase(),
    CHOICE_QUESTION_KEY,
  ]);

  for (const rule of rules) {
    const baseKey = rule.name;
    let key = baseKey;
    for (let n = 2; usedKeys.has(key.toLowerCase()); n++) {
      key = `${baseKey} (${n})`;
    }
    usedKeys.add(key.toLowerCase());
    criteria[key] = rule.instructions.trim() || rule.name;
    rulesByKey.set(key, rule);
  }

  if (coldEmailRule) {
    criteria[COLD_EMAIL_KEY] = getColdEmailCriterion(coldEmailRule);
  }
  criteria[NONE_KEY] = NONE_DEFINITION;

  return { criteria, rulesByKey };
}

// Only the latest message: which rule fits is a property of this email.
// Conversation status (To Reply, FYI, ...) is resolved later from the thread.
function buildState({
  message,
  emailAccount,
  classificationFeedback,
}: {
  message: ParsedMessage;
  emailAccount: EmailAccountWithAI;
  classificationFeedback: ClassificationFeedbackItem[] | null;
}) {
  const email = getEmailForLLM(message, {
    maxLength: EMAIL_CONTENT_MAX_LENGTH,
    extractReply: true,
    stripSignature: true,
  });

  return {
    accountOwner: {
      email: emailAccount.email,
      about: emailAccount.about || null,
    },
    email: {
      from: email.from,
      to: email.to,
      cc: email.cc ?? null,
      replyTo: email.replyTo ?? null,
      subject: email.subject,
      content: email.content,
      hasListUnsubscribeHeader: !!email.listUnsubscribe,
      attachments: email.attachments?.map((a) => a.filename) ?? [],
    },
    ownerCorrectionsForThisSender:
      classificationFeedback?.map((item) => ({
        subject: item.subject,
        rule: item.ruleName,
        ownerAction:
          item.eventType === "LABEL_ADDED" ? "applied rule" : "removed rule",
      })) ?? [],
  };
}

// A choice criterion is a one-line definition, so the default cold-email prompt
// is cut to its opening paragraph. Custom instructions are passed through.
function getColdEmailCriterion(coldEmailRule: Pick<Rule, "instructions">) {
  const instructions = coldEmailRule.instructions?.trim();
  if (!instructions || instructions === DEFAULT_COLD_EMAIL_PROMPT.trim()) {
    return DEFAULT_COLD_EMAIL_PROMPT.split(/\n\s*\n/)[0] ?? "";
  }
  return instructions;
}
