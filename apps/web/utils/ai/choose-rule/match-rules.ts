import { getConditionTypes, isAIRule } from "@/utils/condition";
import {
  findMatchingGroup,
  getGroupsWithRules,
  type GroupsWithRules,
} from "@/utils/group/find-matching-group";
import type { ParsedMessage, RuleWithActions } from "@/utils/types";
import {
  ExecutedRuleStatus,
  LogicalOperator,
  SystemType,
} from "@prisma/client";
import { ConditionType } from "@/utils/config";
import prisma from "@/utils/prisma";
import { aiChooseRule } from "@/utils/ai/choose-rule/ai-choose-rule";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";
import type {
  MatchReason,
  MatchingRuleResult,
} from "@/utils/ai/choose-rule/types";
import { extractEmailAddress } from "@/utils/email";
import { hasIcsAttachment } from "@/utils/parse/calender-event";
import { checkSenderReplyHistory } from "@/utils/reply-tracker/check-sender-reply-history";
import type { EmailProvider } from "@/utils/email/types";
import type { ModelType } from "@/utils/llms/model";
import {
  getColdEmailRule,
  isColdEmailRuleEnabled,
} from "@/utils/cold-email/cold-email-rule";
import { isColdEmail } from "@/utils/cold-email/is-cold-email";
import { isConversationStatusType } from "@/utils/reply-tracker/conversation-status-config";

const logger = createScopedLogger("match-rules");

const TO_REPLY_RECEIVED_THRESHOLD = 10;

type MatchingRulesResult = {
  matches: {
    rule: RuleWithActions;
    matchReasons?: MatchReason[];
  }[];
  reasoning: string;
};

export async function findMatchingRules({
  rules,
  message,
  emailAccount,
  provider,
  modelType,
}: {
  rules: RuleWithActions[];
  message: ParsedMessage;
  emailAccount: EmailAccountWithAI;
  provider: EmailProvider;
  modelType: ModelType;
}): Promise<MatchingRulesResult> {
  const coldEmailRule = await getColdEmailRule(emailAccount.id);

  if (coldEmailRule && isColdEmailRuleEnabled(coldEmailRule)) {
    const coldEmailResult = await isColdEmail({
      email: getEmailForLLM(message),
      emailAccount,
      provider,
      modelType,
      coldEmailRule,
    });

    if (coldEmailResult.isColdEmail) {
      const coldRule = await prisma.rule.findUniqueOrThrow({
        where: { id: coldEmailRule.id },
        include: { actions: true },
      });

      return {
        matches: [{ rule: coldRule, matchReasons: [] }],
        reasoning: coldEmailResult.reason,
      };
    }
  }

  // Filter out cold email rule which was already checked above
  const rulesWithoutColdEmail = rules.filter(
    (rule) => rule.systemType !== SystemType.COLD_EMAIL,
  );

  const results = await findMatchingRulesWithReasons(
    rulesWithoutColdEmail,
    message,
    emailAccount,
    provider,
    modelType,
  );

  return results;
}

/**
 * Finds all rules that potentially match a message.
 *
 * Matching Logic:
 * 1. For rules with learned patterns (groups):
 *    - If pattern matches → add to matches and short-circuit (skip other checks for this rule)
 *    - If pattern doesn't match → continue to check static/AI conditions below
 *    - Note: Groups are independent of the AND/OR operator (which only applies to AI/Static conditions)
 *
 * 2. For all other rules (or group rules that didn't match via pattern):
 *    - Check static conditions (from, to, subject, body)
 *    - Check if AI instructions are present
 *    - Respect the conditional operator (AND/OR) between static and AI conditions
 *    - Add to matches if conditions match, or to potentialAiMatches if AI check is needed
 *
 * 3. Prioritization (at the end):
 *    - If ANY learned pattern matches were found → ignore all potentialAiMatches
 *    - This is an optimization: learned patterns are trusted and avoid expensive AI calls
 *    - Multiple learned pattern matches can be returned
 */
async function findPotentialMatchingRules({
  rules,
  message,
  isThread,
  provider,
  emailAccountId,
}: {
  rules: RuleWithActions[];
  message: ParsedMessage;
  isThread: boolean;
  provider: EmailProvider;
  emailAccountId: string;
}): Promise<MatchingRuleResult> {
  const matches: {
    rule: RuleWithActions;
    matchReasons: MatchReason[];
  }[] = [];
  const potentialAiMatches: (RuleWithActions & { instructions: string })[] = [];

  const learnedPatternsLoader = new LearnedPatternsLoader();
  const previousRulesLoader = new PreviousThreadRulesLoader({
    emailAccountId,
    threadId: message.threadId,
  });

  // Go through all rules and collect matches and potential AI matches
  for (const rule of rules) {
    // Special case for calendar rules
    const calendarMatch =
      rule.systemType === SystemType.CALENDAR && hasIcsAttachment(message);

    if (calendarMatch) {
      matches.push({
        rule,
        matchReasons: [
          { type: ConditionType.PRESET, systemType: SystemType.CALENDAR },
        ],
      });
      continue;
    }

    // Learned patterns (groups)
    // Note: Groups are independent of the AND/OR operator (which only applies to AI/Static conditions)
    if (rule.groupId) {
      const groups = await learnedPatternsLoader.getGroups(rule.emailAccountId);
      if (groups?.length) {
        const { matchingItem, group, ruleExcluded } = matchesGroupRule(
          rule,
          groups,
          message,
        );

        // If this rule is excluded by an exclusion pattern, skip it entirely
        if (ruleExcluded) continue;

        if (matchingItem) {
          // Group matched - add to matches and skip other condition checks
          matches.push({
            rule,
            matchReasons: [
              {
                type: ConditionType.LEARNED_PATTERN,
                groupItem: matchingItem,
                group,
              },
            ],
          });
          continue;
        }
      }
    }

    // Skip rules with runOnThreads=false, unless this rule was previously applied in the thread
    // This ensures thread continuity (e.g., notifications continue to be labeled as notifications)
    if (isThread && !rule.runOnThreads) {
      const previousRuleIds = await previousRulesLoader.getRuleIds();
      const wasPreviouslyApplied = previousRuleIds.has(rule.id);

      if (!wasPreviouslyApplied) {
        continue;
      }
    }

    // AI + Static conditions
    const { matched, potentialAiMatch, matchReasons } = evaluateRuleConditions({
      rule,
      message,
    });

    if (matched) {
      matches.push({ rule, matchReasons });
    }

    if (potentialAiMatch) {
      potentialAiMatches.push({
        ...rule,
        instructions: rule.instructions ?? "",
      });
    }
  }

  // TODO: move into loop for consistency?
  const filteredPotentialAiMatches = await filterConversationStatusRules(
    potentialAiMatches,
    message,
    provider,
  );

  const hasLearnedPatternMatch = matches.some((m) =>
    m.matchReasons.some((r) => r.type === ConditionType.LEARNED_PATTERN),
  );

  // If we have a learned pattern match, then return all matches and no potential AI matches
  // Learned patterns are used for efficiency to avoid running AI for every rule
  return {
    matches,
    potentialAiMatches: hasLearnedPatternMatch
      ? []
      : filteredPotentialAiMatches,
  };
}

export function evaluateRuleConditions({
  rule,
  message,
}: {
  rule: RuleWithActions;
  message: ParsedMessage;
}): {
  matched: boolean;
  potentialAiMatch: boolean;
  matchReasons: MatchReason[];
} {
  const { conditionalOperator: operator } = rule;
  const conditionTypes = getConditionTypes(rule);
  const hasAiCondition = conditionTypes.AI && isAIRule(rule);
  const hasStaticCondition = conditionTypes.STATIC;

  const matchReasons: MatchReason[] = [];

  // Check STATIC condition
  const staticMatch = hasStaticCondition
    ? matchesStaticRule(rule, message)
    : false;
  if (staticMatch) {
    matchReasons.push({ type: ConditionType.STATIC });
  }

  // Determine result based on what we have
  if (operator === LogicalOperator.OR) {
    // OR logic
    if (staticMatch) {
      // Found a match, no need for AI
      return { matched: true, potentialAiMatch: false, matchReasons };
    }
    if (hasAiCondition) {
      // No static match, but have AI - need to check AI
      return { matched: false, potentialAiMatch: true, matchReasons };
    }
    // No conditions means no match
    return { matched: false, potentialAiMatch: false, matchReasons };
  } else {
    // AND logic
    if (hasStaticCondition && !staticMatch) {
      // Static failed, so AND fails
      return { matched: false, potentialAiMatch: false, matchReasons: [] };
    }
    if (hasAiCondition) {
      // Static passed (or doesn't exist), but need AI to complete AND
      return { matched: false, potentialAiMatch: true, matchReasons };
    }
    // Only static (and it passed), or no conditions (no match)
    const matched = hasStaticCondition ? staticMatch : false;
    return { matched, potentialAiMatch: false, matchReasons };
  }
}

// Lazy load learned patterns when needed
class LearnedPatternsLoader {
  private groups?: GroupsWithRules | null;

  async getGroups(emailAccountId: string) {
    if (this.groups === undefined)
      this.groups = await getGroupsWithRules({ emailAccountId });
    return this.groups;
  }
}

// Lazy load previously executed rules in thread when needed
class PreviousThreadRulesLoader {
  private ruleIds?: Set<string>;
  private readonly emailAccountId: string;
  private readonly threadId: string;

  constructor({
    emailAccountId,
    threadId,
  }: {
    emailAccountId: string;
    threadId: string;
  }) {
    this.emailAccountId = emailAccountId;
    this.threadId = threadId;
  }

  async getRuleIds(): Promise<Set<string>> {
    if (this.ruleIds === undefined) {
      this.ruleIds = await getPreviouslyExecutedRuleIds({
        emailAccountId: this.emailAccountId,
        threadId: this.threadId,
      });
    }
    return this.ruleIds;
  }
}

function getMatchReason(matchReasons?: MatchReason[]): string | undefined {
  if (!matchReasons || matchReasons.length === 0) return;

  return matchReasons
    .map((reason) => {
      switch (reason.type) {
        case ConditionType.STATIC:
          return "Matched static conditions";
        case ConditionType.LEARNED_PATTERN:
          return `Matched learned pattern: "${reason.groupItem.type}: ${reason.groupItem.value}"`;
        case ConditionType.PRESET:
          return "Matched a system preset";
      }
    })
    .join(", ");
}

async function findMatchingRulesWithReasons(
  rules: RuleWithActions[],
  message: ParsedMessage,
  emailAccount: EmailAccountWithAI,
  provider: EmailProvider,
  modelType: ModelType,
): Promise<MatchingRulesResult> {
  const isThread = provider.isReplyInThread(message);

  const { matches, potentialAiMatches } = await findPotentialMatchingRules({
    rules,
    message,
    isThread,
    provider,
    emailAccountId: emailAccount.id,
  });

  if (potentialAiMatches.length) {
    const fullResult = await aiChooseRule({
      email: getEmailForLLM(message),
      rules: potentialAiMatches,
      emailAccount,
      modelType,
    });

    const result = {
      rules: filterMultipleSystemRules(fullResult.rules),
      reason: fullResult.reason,
    };

    // Build combined matches: start with existing static/learned matches, then append AI-selected matches
    const combinedMatches = [
      // Map existing matches to the same output shape
      ...matches.map((match) => ({
        rule: match.rule,
        matchReasons: match.matchReasons || [],
      })),
      // Append AI-selected matches, deduplicating by rule id
      ...result.rules
        .filter(
          (aiRule) =>
            !matches.some(
              (existingMatch) => existingMatch.rule.id === aiRule.id,
            ),
        )
        .map((rule) => ({
          rule,
          matchReasons: [{ type: ConditionType.AI }],
        })),
    ];

    // Combine reasoning: existing reasoning plus AI reasoning
    const existingReasoning = matches
      .map((m) => getMatchReason(m.matchReasons))
      .filter((r): r is string => !!r)
      .join(", ");

    const aiReason = result.reason?.trim();
    const combinedReasoning = [existingReasoning, aiReason]
      .filter((r): r is string => !!r)
      .join("; ");

    return {
      matches: combinedMatches,
      reasoning: combinedReasoning,
    };
  } else {
    return {
      matches,
      reasoning: matches
        .map((m) => getMatchReason(m.matchReasons))
        .filter((r): r is string => !!r)
        .join(", "),
    };
  }
}

export function matchesStaticRule(
  rule: Pick<RuleWithActions, "from" | "to" | "subject" | "body">,
  message: ParsedMessage,
) {
  const { from, to, subject, body } = rule;

  if (!from && !to && !subject && !body) return false;

  const safeRegexTest = (
    pattern: string,
    text: string,
    allowPipeAsOr = false,
  ) => {
    try {
      // Split by pipe, comma, or " OR " to handle OR conditions only for email fields (from/to)
      // Supports: "@a.com|@b.com", "@a.com, @b.com", "@a.com OR @b.com"
      const patterns = allowPipeAsOr ? splitEmailPatterns(pattern) : [pattern];

      // Test each pattern individually
      for (const individualPattern of patterns) {
        // Escape regex special characters except for * which we want to support as wildcards
        const escapedPattern = individualPattern.replace(
          /[.+?^${}()[\]\\]/g,
          "\\$&",
        );

        // Convert all * to .* for wildcard matching
        const regexPattern = escapedPattern.replace(/\*/g, ".*");

        if (new RegExp(regexPattern).test(text)) {
          return true;
        }
      }

      return false;
    } catch (error) {
      logger.error("Invalid regex pattern", { pattern, error });
      return false;
    }
  };

  const fromMatch = from
    ? safeRegexTest(from, message.headers.from, true)
    : true;
  const toMatch = to ? safeRegexTest(to, message.headers.to, true) : true;
  const subjectMatch = subject
    ? safeRegexTest(subject, message.headers.subject, false)
    : true;
  const bodyMatch = body
    ? safeRegexTest(body, message.textPlain || "", false)
    : true;

  return fromMatch && toMatch && subjectMatch && bodyMatch;
}

/**
 * Split email patterns by pipe, comma, or " OR " separator.
 * Used for from/to fields to support multiple email addresses.
 * Examples: "@a.com|@b.com", "@a.com, @b.com", "@a.com OR @b.com"
 */
export function splitEmailPatterns(pattern: string): string[] {
  return pattern
    .split(/\s*\bor\b\s*|[|,]/i)
    .map((p) => p.trim())
    .filter(Boolean);
}

function matchesGroupRule(
  rule: RuleWithActions,
  groups: GroupsWithRules,
  message: ParsedMessage,
) {
  const ruleGroup = groups.find((g) => g.id === rule.groupId);
  if (!ruleGroup)
    return { group: null, matchingItem: null, ruleExcluded: false };

  const result = findMatchingGroup(message, ruleGroup);

  if (result.excluded) {
    // Return a special flag to indicate this rule should be completely excluded
    return { group: null, matchingItem: null, ruleExcluded: true };
  }

  if (result.matchingItem) {
    return { ...result, ruleExcluded: false };
  }

  return { group: null, matchingItem: null, ruleExcluded: false };
}

export async function filterConversationStatusRules<
  T extends { id: string; systemType: SystemType | null },
>(
  potentialMatches: T[],
  message: ParsedMessage,
  provider: EmailProvider,
): Promise<T[]> {
  const toReplyRule = potentialMatches.find(
    (r) => r.systemType === SystemType.TO_REPLY,
  );

  if (!toReplyRule) return potentialMatches;

  const senderEmail = message.headers.from;
  if (!senderEmail) return potentialMatches;

  const extractedSenderEmail = extractEmailAddress(senderEmail);

  const noReplyPrefixes = [
    "noreply@",
    "no-reply@",
    "notifications@",
    "notif@",
    "info@",
    "newsletter@",
    "updates@",
    "account@",
  ];

  function filteredOutConversationStatusRules() {
    return potentialMatches.filter(
      (r) => !isConversationStatusType(r.systemType),
    );
  }

  if (
    noReplyPrefixes.some((prefix) => extractedSenderEmail.startsWith(prefix))
  ) {
    return filteredOutConversationStatusRules();
  }

  try {
    const { hasReplied, receivedCount } = await checkSenderReplyHistory(
      provider,
      senderEmail,
      TO_REPLY_RECEIVED_THRESHOLD,
    );

    if (!hasReplied && receivedCount >= TO_REPLY_RECEIVED_THRESHOLD) {
      logger.info(
        "Filtering out TO_REPLY rule due to no prior reply and high received count",
        {
          ruleId: toReplyRule.id,
          senderEmail,
          receivedCount,
        },
      );
      return filteredOutConversationStatusRules();
    }
  } catch (error) {
    logger.error("Error checking reply history for TO_REPLY filter", {
      senderEmail,
      error,
    });
  }

  return potentialMatches;
}

/**
 * Filter system rules: if multiple system rules were matched, only keep the primary one.
 * Always keep all conversation rules (non-system rules).
 */
export function filterMultipleSystemRules<
  T extends { name: string; instructions: string; systemType?: string | null },
>(selectedRules: { rule: T; isPrimary?: boolean }[]): T[] {
  const systemRules = selectedRules.filter((r) => r.rule?.systemType);
  const conversationRules = selectedRules.filter(
    (r) => r.rule && !r.rule?.systemType,
  );

  let filteredSystemRules = systemRules;
  if (systemRules.length > 1) {
    // Only keep the primary system rule
    const primarySystemRule = systemRules.find((r) => r.isPrimary);
    filteredSystemRules = primarySystemRule ? [primarySystemRule] : systemRules;
  }

  return [...filteredSystemRules, ...conversationRules].map((r) => r.rule);
}

/**
 * Gets the IDs of rules that were previously executed in this thread.
 * This allows us to continue applying the same rules to a thread for consistency,
 * even if `runOnThreads` is false.
 */
async function getPreviouslyExecutedRuleIds({
  emailAccountId,
  threadId,
}: {
  emailAccountId: string;
  threadId: string;
}): Promise<Set<string>> {
  const previousRules = await prisma.executedRule.findMany({
    where: {
      emailAccountId,
      threadId,
      status: ExecutedRuleStatus.APPLIED,
      ruleId: { not: null },
    },
    select: { ruleId: true },
    distinct: ["ruleId"],
  });

  return new Set(
    previousRules.map((r) => r.ruleId).filter((id): id is string => !!id),
  );
}
