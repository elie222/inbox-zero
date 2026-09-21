import type { Rule } from "@/generated/prisma/client";
import { SystemType } from "@/generated/prisma/enums";
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
import {
  CONVERSATION_TRACKING_META_RULE_ID,
  isConversationStatusType,
} from "@/utils/reply-tracker/conversation-status-config";
import type { ClassificationFeedbackItem } from "@/utils/rule/classification-feedback";
import { isDefaultRuleInstructions } from "@/utils/rule/consts";
import type { ParsedMessage } from "@/utils/types";

const MODULE = "classifier-choose-rule";

const NONE_KEY = "None";
const NONE_DEFINITION = "None of the rules apply to this email";
const QUESTION =
  "Which rule best describes this email, from the point of view of the account owner?";
// Rule names become question keys, so the choice lives under a key no rule
// name can take.
const CHOICE_QUESTION_KEY = "__rule_choice__";
const COLD_EMAIL_QUESTION_KEY = "__cold_email__";
const RULE_APPLIES_QUESTION = "Does this rule apply to this email?";
const RULE_APPLIES_THRESHOLD = 0.5;
const EMAIL_CONTENT_MAX_LENGTH = 2000;

// Well above a coin flip: a false "cold" hides a real email, a missed one
// only leaves a message in the inbox.
const COLD_EMAIL_THRESHOLD = 0.7;

const DEAD_HEAT_MARGIN = 0.1;

// The rule's own text leaves digests, and automated mail carrying someone's
// words, to the Conversations rule.
const NOTIFICATION_CRITERION =
  "Notifications: Alerts, status updates, or system messages sent automatically by a platform or service, including ones that pass along something another person wrote.";

type RuleCandidate = {
  id: string;
  name: string;
  instructions: string;
  systemType?: string | null;
};

type ClassifierRuleSelection<T> =
  | { type: "coldEmail"; reason: string }
  | { type: "rules"; rules: { rule: T; isPrimary?: boolean }[]; reason: string }
  | { type: "undecided"; reason: string };

/**
 * Cold email is a separate question rather than one more option in the choice,
 * so it never competes with Marketing or Notification for probability. The
 * classifier answers both in one request, so this costs no extra call.
 */
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
}): Promise<ClassifierRuleSelection<T>> {
  const logger = parentLogger.with({ module: MODULE });

  const { criteria, rulesByKey } = buildCriteria(rules);

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
      ...(rules.length
        ? {
            [CHOICE_QUESTION_KEY]: {
              type: "choice" as const,
              instructions: QUESTION,
              criteria,
            },
          }
        : {}),
      ...(coldEmailRule
        ? { [COLD_EMAIL_QUESTION_KEY]: buildColdEmailQuestion(coldEmailRule) }
        : {}),
    },
    label: "Classifier rule selection",
    logger,
  });

  let coldEmailProbability: number | null = null;

  if (coldEmailRule) {
    const coldAnswer = res.answers[COLD_EMAIL_QUESTION_KEY];
    if (coldAnswer?.type !== "yesNo") {
      throw new Error("Classifier response is missing the cold email answer");
    }
    coldEmailProbability = coldAnswer.probability;

    if (coldEmailProbability > COLD_EMAIL_THRESHOLD) {
      logger.info("Classifier says cold email", {
        coldEmailProbability,
        model: res.model,
        inputTokens: res.inputTokens,
      });

      return {
        type: "coldEmail",
        reason: `Classifier says cold email (confidence ${coldEmailProbability.toFixed(2)})`,
      };
    }
  }

  if (!rules.length) {
    return { type: "rules", rules: [], reason: "Classifier says not cold" };
  }

  const answer = res.answers[CHOICE_QUESTION_KEY];
  if (answer?.type !== "choice") {
    throw new Error("Classifier response is missing the rule choice");
  }

  const { choice, probability, margin } = resolveChoice({ answer, rulesByKey });

  const ruleApplies = Object.fromEntries(
    Object.keys(ruleAppliesQuestions).map((key) => {
      const ruleAnswer = res.answers[key];
      return [key, ruleAnswer?.type === "yesNo" ? ruleAnswer.probability : 0];
    }),
  );

  logger.info("Classifier chose rule", {
    choice,
    topChoice: answer.choice,
    confidence: probability,
    margin,
    probabilities: answer.probabilities,
    ruleApplies,
    coldEmailProbability,
    model: res.model,
    inputTokens: res.inputTokens,
  });

  if (margin !== null && margin < DEAD_HEAT_MARGIN) {
    return {
      type: "undecided",
      reason: `Classifier was too close to call (margin ${margin.toFixed(2)})`,
    };
  }

  const reason = `Classifier chose "${choice}" (confidence ${probability.toFixed(2)})`;

  if (choice === NONE_KEY) return { type: "rules", rules: [], reason };

  const primaryRule = rulesByKey.get(choice);
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
    type: "rules",
    rules: [{ rule: primaryRule, isPrimary: true }, ...additionalRules],
    reason,
  };
}

/**
 * "This is bulk mail" is split across every content rule while "this is a
 * conversation" collects all of its own, so the highest single answer can lose
 * a contest it wins on the total. Only those two answers are decided this way:
 * a custom rule or "None" at the top won a different contest.
 */
function resolveChoice<T extends RuleCandidate>({
  answer,
  rulesByKey,
}: {
  answer: {
    choice: string;
    confidence: number;
    probabilities: Record<string, number>;
  };
  rulesByKey: Map<string, T>;
}): { choice: string; probability: number; margin: number | null } {
  const probabilityOf = (key: string) => answer.probabilities[key] ?? 0;
  const unaggregated = {
    choice: answer.choice,
    probability: answer.confidence,
    margin: null,
  };

  const conversationKey = [...rulesByKey].find(([, rule]) =>
    isConversationRule(rule),
  )?.[0];
  const contentKeys = [...rulesByKey]
    .filter(([, rule]) => isContentRule(rule))
    .map(([key]) => key)
    .sort((a, b) => probabilityOf(b) - probabilityOf(a));

  if (!conversationKey || !contentKeys.length) return unaggregated;
  if (answer.choice !== conversationKey && !contentKeys.includes(answer.choice))
    return unaggregated;

  const conversation = probabilityOf(conversationKey);
  const content = contentKeys.reduce(
    (total, key) => total + probabilityOf(key),
    0,
  );
  const topContentKey = contentKeys[0]!;
  const choice = conversation > content ? conversationKey : topContentKey;

  const runnerUpKey = contentKeys[1];
  const contentMargin = runnerUpKey
    ? probabilityOf(topContentKey) - probabilityOf(runnerUpKey)
    : Number.POSITIVE_INFINITY;

  return {
    choice,
    probability: probabilityOf(choice),
    margin: Math.min(
      Math.abs(conversation - content),
      choice === conversationKey ? Number.POSITIVE_INFINITY : contentMargin,
    ),
  };
}

function isConversationRule(rule: RuleCandidate) {
  return (
    rule.id === CONVERSATION_TRACKING_META_RULE_ID ||
    isConversationStatusType(rule.systemType as SystemType | null)
  );
}

/** A system rule for a kind of mail: Newsletter, Receipt, Notification, ... */
function isContentRule(rule: RuleCandidate) {
  return (
    !!rule.systemType &&
    !isConversationRule(rule) &&
    rule.systemType !== SystemType.COLD_EMAIL
  );
}

function buildCriteria<T extends RuleCandidate>(rules: T[]) {
  const criteria: Record<string, string> = {};
  const rulesByKey = new Map<string, T>();
  const usedKeys = new Set<string>([
    NONE_KEY.toLowerCase(),
    CHOICE_QUESTION_KEY,
    COLD_EMAIL_QUESTION_KEY,
  ]);

  for (const rule of rules) {
    const baseKey = rule.name;
    let key = baseKey;
    for (let n = 2; usedKeys.has(key.toLowerCase()); n++) {
      key = `${baseKey} (${n})`;
    }
    usedKeys.add(key.toLowerCase());
    criteria[key] = getRuleCriterion(rule);
    rulesByKey.set(key, rule);
  }

  criteria[NONE_KEY] = NONE_DEFINITION;

  return { criteria, rulesByKey };
}

function getRuleCriterion(rule: RuleCandidate) {
  if (
    rule.systemType === SystemType.NOTIFICATION &&
    isDefaultRuleInstructions(SystemType.NOTIFICATION, rule.instructions)
  ) {
    return NOTIFICATION_CRITERION;
  }

  return rule.instructions.trim() || rule.name;
}

// The whole prompt: the paragraphs ruling out newsletters and marketing are
// what keep ordinary bulk mail from being flagged.
function buildColdEmailQuestion(
  coldEmailRule: Pick<Rule, "instructions">,
): ClassifierQuestion {
  const instructions =
    coldEmailRule.instructions?.trim() || DEFAULT_COLD_EMAIL_PROMPT;

  return {
    type: "yesNo",
    instructions: `Is this a cold email? ${instructions} Answer about this email only.`,
  };
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
