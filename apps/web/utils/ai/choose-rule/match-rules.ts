import { getConditionTypes, isAIRule } from "@/utils/condition";
import {
  findMatchingGroup,
  getGroupsWithRules,
} from "@/utils/group/find-matching-group";
import type { ParsedMessage, RuleWithActions } from "@/utils/types";
import { LogicalOperator, SystemType } from "@prisma/client";
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

async function findPotentialMatchingRules({
  rules,
  message,
  isThread,
  provider,
}: {
  rules: RuleWithActions[];
  message: ParsedMessage;
  isThread: boolean;
  provider: EmailProvider;
}): Promise<MatchingRuleResult> {
  const matches: {
    rule: RuleWithActions;
    matchReasons: MatchReason[]; // why do we need match reasons?
  }[] = [];
  const potentialAiMatches: (RuleWithActions & { instructions: string })[] = [];

  const learnedPatternsLoader = new LearnedPatternsLoader();

  // Go through all rules
  // Collect matches and potential AI matches
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
    }

    // TODO: still run this, if a previous email in the thread matched the rule
    if (isThread && !rule.runOnThreads) continue;

    // Learned patterns (groups)
    // Ignores conditional operator
    if (rule.groupId) {
      const groups = await learnedPatternsLoader.getGroups(rule.emailAccountId);
      if (!groups?.length) continue;
      const { matchingItem, group, ruleExcluded } = matchesGroupRule(
        rule,
        groups,
        message,
      );

      // If this rule is excluded by an exclusion pattern, skip it entirely
      if (ruleExcluded) continue;

      if (matchingItem) {
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

function evaluateRuleConditions({
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
    // No matches at all
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
    // Only static, and it passed
    return { matched: staticMatch, potentialAiMatch: false, matchReasons };
  }
}

// Lazy load learned patterns when needed
class LearnedPatternsLoader {
  private groups?: Awaited<ReturnType<typeof getGroupsWithRules>> | null;

  async getGroups(emailAccountId: string) {
    if (this.groups === undefined)
      this.groups = await getGroupsWithRules({ emailAccountId });
    return this.groups;
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
  });

  if (potentialAiMatches.length) {
    const result = await aiChooseRule({
      email: getEmailForLLM(message),
      rules: potentialAiMatches,
      emailAccount,
      modelType,
    });

    return {
      matches: result.rules.map((rule) => ({
        rule,
        matchReasons: [{ type: ConditionType.AI }],
      })),
      reasoning: result.reason,
    };
  } else {
    return {
      matches,
      reasoning: matches
        .flatMap((m) => getMatchReason(m.matchReasons))
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
  groups: Awaited<ReturnType<typeof getGroupsWithRules>>,
  message: ParsedMessage,
) {
  const ruleGroup = groups.find((g) => g.rule?.id === rule.id);
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
