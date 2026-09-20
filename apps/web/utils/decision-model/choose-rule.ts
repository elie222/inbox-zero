import type { Rule } from "@/generated/prisma/client";
import { shouldSelectMultipleRules } from "@/utils/ai/choose-rule/ai-choose-rule";
import {
  type DecisionModelConfig,
  runDecisionModel,
} from "@/utils/decision-model/decision-model";
import { DEFAULT_COLD_EMAIL_PROMPT } from "@/utils/cold-email/prompt";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import type { Logger } from "@/utils/logger";
import type { ClassificationFeedbackItem } from "@/utils/rule/classification-feedback";
import type { ParsedMessage } from "@/utils/types";

const MODULE = "decision-model-choose-rule";

const COLD_EMAIL_KEY = "Cold Email";
const NONE_KEY = "None";
const NONE_DEFINITION = "None of the rules apply to this email";
const QUESTION =
  "Which rule best describes this email, from the point of view of the account owner?";
// Rule names become question keys, so the choice lives under a key no rule
// name can take.
const CHOICE_QUESTION_KEY = "__rule_choice__";
const MIN_CHOICE_CONFIDENCE = 0.3;
const EMAIL_CONTENT_MAX_LENGTH = 2000;

type RuleCandidate = {
  id: string;
  name: string;
  instructions: string;
  systemType?: string | null;
};

export async function decisionModelChooseRule<T extends RuleCandidate>({
  decisionModel,
  message,
  emailAccount,
  rules,
  coldEmailRule,
  classificationFeedback,
  logger: parentLogger,
}: {
  decisionModel: DecisionModelConfig;
  message: ParsedMessage;
  emailAccount: EmailAccountWithAI;
  rules: T[];
  // Pass when the cold-email decision is still open so the decision model makes it too.
  coldEmailRule: Pick<Rule, "instructions"> | null;
  classificationFeedback: ClassificationFeedbackItem[] | null;
  logger: Logger;
}): Promise<{
  rules: { rule: T; isPrimary?: boolean }[];
  reason: string;
  isColdEmail: boolean;
}> {
  const logger = parentLogger.with({ module: MODULE });

  // Secondary rules can overlap the primary rule, and JEV did not reliably
  // separate those from explicit negative instructions in evals.
  if (shouldSelectMultipleRules({ rules, emailAccount })) {
    throw new Error(
      "Decision model does not support multi-rule selection; use the LLM path",
    );
  }

  const { criteria, rulesByKey } = buildCriteria({ rules, coldEmailRule });

  const res = await runDecisionModel({
    config: decisionModel,
    emailAccount,
    state: buildState({
      message,
      emailAccount,
      classificationFeedback,
      candidateRules: [...rulesByKey].map(([name, rule]) => ({
        name,
        instructions: rule.instructions.trim() || rule.name,
      })),
    }),
    questions: {
      [CHOICE_QUESTION_KEY]: {
        type: "choice",
        instructions: QUESTION,
        criteria,
      },
    },
    label: "Choose rule",
    logger,
  });

  const answer = res.answers[CHOICE_QUESTION_KEY];
  if (answer?.type !== "choice") {
    throw new Error("Decision model response is missing the rule choice");
  }
  if (answer.confidence < MIN_CHOICE_CONFIDENCE) {
    throw new Error("Decision model confidence is too low for rule selection");
  }

  logger.info("Decision model chose rule", {
    choice: answer.choice,
    confidence: answer.confidence,
    probabilities: answer.probabilities,
    model: res.model,
    inputTokens: res.inputTokens,
  });

  const reason = `Decision model chose "${answer.choice}" (confidence ${answer.confidence.toFixed(2)})`;

  if (answer.choice === NONE_KEY)
    return { rules: [], reason, isColdEmail: false };
  if (answer.choice === COLD_EMAIL_KEY) {
    return { rules: [], reason, isColdEmail: true };
  }

  const primaryRule = rulesByKey.get(answer.choice);
  if (!primaryRule) {
    throw new Error("Decision model chose a rule that was not offered");
  }

  return {
    rules: [{ rule: primaryRule, isPrimary: true }],
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
  candidateRules,
}: {
  message: ParsedMessage;
  emailAccount: EmailAccountWithAI;
  classificationFeedback: ClassificationFeedbackItem[] | null;
  candidateRules: { name: string; instructions: string }[];
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
    candidateRules,
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
