import { SystemType } from "@/generated/prisma/enums";
import { shouldSelectMultipleRules } from "@/utils/ai/choose-rule/ai-choose-rule";
import {
  type DecisionModelConfig,
  runDecisionModel,
} from "@/utils/decision-model/decision-model";
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

const MODULE = "decision-model-choose-rule";

const NONE_KEY = "None";
const NONE_DEFINITION = "None of the rules apply to this email";
const QUESTION =
  "Which rule best describes this email, from the point of view of the account owner?";
// Rule names become question keys, so the choice lives under a key no rule
// name can take.
const CHOICE_QUESTION_KEY = "__rule_choice__";
const MIN_CHOICE_CONFIDENCE = 0.3;
const EMAIL_CONTENT_MAX_LENGTH = 2000;

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

type DecisionRuleSelection<T> =
  | { type: "rules"; rules: { rule: T; isPrimary?: boolean }[]; reason: string }
  | { type: "undecided"; reason: string };

export async function decisionModelChooseRule<T extends RuleCandidate>({
  decisionModel,
  message,
  emailAccount,
  rules,
  classificationFeedback,
  logger: parentLogger,
}: {
  decisionModel: DecisionModelConfig;
  message: ParsedMessage;
  emailAccount: EmailAccountWithAI;
  rules: T[];
  classificationFeedback: ClassificationFeedbackItem[] | null;
  logger: Logger;
}): Promise<DecisionRuleSelection<T>> {
  const logger = parentLogger.with({ module: MODULE });

  // Secondary rules can overlap the primary rule, and JEV did not reliably
  // separate those from explicit negative instructions in evals.
  if (shouldSelectMultipleRules({ rules, emailAccount })) {
    throw new Error(
      "Decision model does not support multi-rule selection; use the LLM path",
    );
  }

  const { criteria, rulesByKey } = buildCriteria(rules);

  const res = await runDecisionModel({
    config: decisionModel,
    emailAccount,
    state: buildState({
      message,
      emailAccount,
      classificationFeedback,
      candidateRules: [...rulesByKey].map(([name, rule]) => ({
        name,
        instructions: getRuleCriterion(rule),
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
  const { choice, probability, margin } = resolveChoice({ answer, rulesByKey });
  if (probability < MIN_CHOICE_CONFIDENCE) {
    throw new Error("Decision model confidence is too low for rule selection");
  }
  logger.info("Decision model chose rule", {
    choice,
    topChoice: answer.choice,
    confidence: probability,
    margin,
    // An array, not a record: each key of a logged object becomes a permanent
    // Axiom field, and these keys are user-named rules.
    probabilities: Object.entries(answer.probabilities)
      .sort(([, a], [, b]) => b - a)
      .map(([rule, probability]) => ({ rule, probability })),
    model: res.model,
    inputTokens: res.inputTokens,
  });

  if (margin !== null && margin < DEAD_HEAT_MARGIN) {
    return {
      type: "undecided",
      reason: `Decision model was too close to call (margin ${margin.toFixed(2)})`,
    };
  }

  const reason = `Decision model chose "${choice}" (confidence ${probability.toFixed(2)})`;

  if (choice === NONE_KEY) return { type: "rules", rules: [], reason };

  const primaryRule = rulesByKey.get(choice);
  if (!primaryRule) {
    throw new Error("Decision model chose a rule that was not offered");
  }

  return {
    type: "rules",
    rules: [{ rule: primaryRule, isPrimary: true }],
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
