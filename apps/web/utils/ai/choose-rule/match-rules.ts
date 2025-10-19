import { getConditionTypes, isAIRule } from "@/utils/condition";
import {
  findMatchingGroup,
  getGroupsWithRules,
} from "@/utils/group/find-matching-group";
import type {
  ParsedMessage,
  RuleWithActions,
  RuleWithActionsAndCategories,
} from "@/utils/types";
import {
  CategoryFilterType,
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

// if we find a match, return it
// if we don't find a match, return the potential matches
// ai rules need further processing to determine if they match

async function findPotentialMatchingRules({
  rules,
  message,
  isThread,
  provider,
}: {
  rules: RuleWithActionsAndCategories[];
  message: ParsedMessage;
  isThread: boolean;
  provider: EmailProvider;
}): Promise<MatchingRuleResult> {
  const potentialMatches: (RuleWithActionsAndCategories & {
    instructions: string;
  })[] = [];

  const calendarMatch = checkCalendarMatch({ rules, message });
  if (calendarMatch) return calendarMatch;

  const contextLoader = new ContextLoader(message);

  // loop through rules and check if they match
  for (const rule of rules) {
    const { runOnThreads, conditionalOperator: operator } = rule;

    if (isThread && !runOnThreads) continue;

    const conditionTypes = getConditionTypes(rule);
    const matchReasons: MatchReason[] = [];

    // Learned patterns (groups)
    // If a match is found, return it immediately
    // Ignores conditional operator
    if (rule.groupId) {
      const groups = await contextLoader.getGroups(rule.emailAccountId);
      const { matchingItem, group, ruleExcluded } = matchesGroupRule(
        rule,
        groups,
        message,
      );

      // If this rule is excluded by an exclusion pattern, skip it entirely
      if (ruleExcluded) continue;

      if (matchingItem) {
        matchReasons.push({
          type: ConditionType.GROUP,
          groupItem: matchingItem,
          group,
        });

        return { match: rule, matchReasons };
      }
    }

    // Regular conditions:
    const unmatchedConditions = new Set<ConditionType>(
      Object.keys(conditionTypes) as ConditionType[],
    );

    if (conditionTypes.STATIC) {
      const match = matchesStaticRule(rule, message);
      if (match) {
        unmatchedConditions.delete(ConditionType.STATIC);
        matchReasons.push({ type: ConditionType.STATIC });
        if (operator === LogicalOperator.OR || !unmatchedConditions.size)
          return { match: rule, matchReasons };
      } else {
        // no match, so can't be a match with AND
        if (operator === LogicalOperator.AND) continue;
      }
    }

    if (conditionTypes.CATEGORY) {
      const sender = await contextLoader.getSender(rule.emailAccountId);
      const matchedCategory = matchesCategoryRule(rule, sender);
      if (matchedCategory) {
        unmatchedConditions.delete(ConditionType.CATEGORY);
        if (typeof matchedCategory !== "boolean") {
          matchReasons.push({
            type: ConditionType.CATEGORY,
            category: matchedCategory,
          });
        }
        if (operator === LogicalOperator.OR || !unmatchedConditions.size)
          return { match: rule, matchReasons };
      } else {
        // no match, so can't be a match with AND
        if (operator === LogicalOperator.AND) continue;
      }
    }

    if (conditionTypes.AI && isAIRule(rule)) {
      // we'll need to run the LLM later to determine if it matches
      potentialMatches.push(rule);
    }
  }

  const filteredPotentialMatches = await filterConversationStatusRules(
    potentialMatches,
    message,
    provider,
  );

  return { potentialMatches: filteredPotentialMatches };
}

function checkCalendarMatch({
  rules,
  message,
}: {
  rules: RuleWithActionsAndCategories[];
  message: ParsedMessage;
}): MatchingRuleResult | undefined {
  const isCalendarEvent = hasIcsAttachment(message);
  if (!isCalendarEvent) return;

  const rule = rules.find((r) => r.systemType === SystemType.CALENDAR);
  if (!rule) return;

  logger.info("Found matching calendar rule", {
    ruleId: rule.id,
    messageId: message.id,
  });
  return {
    match: rule,
    matchReasons: [
      { type: ConditionType.PRESET, systemType: SystemType.CALENDAR },
    ],
  };
}

// Lazy load context data when needed
class ContextLoader {
  private readonly message: ParsedMessage;
  private groups: Awaited<ReturnType<typeof getGroupsWithRules>>;
  private sender: { categoryId: string | null } | null | undefined;

  constructor(message: ParsedMessage) {
    this.message = message;
    this.groups = [];
    this.sender = undefined;
  }

  async getGroups(emailAccountId: string) {
    if (!this.groups)
      this.groups = await getGroupsWithRules({ emailAccountId });
    return this.groups;
  }

  async getSender(emailAccountId: string) {
    if (!this.sender) {
      this.sender = await prisma.newsletter.findUnique({
        where: {
          email_emailAccountId: {
            email: extractEmailAddress(this.message.headers.from),
            emailAccountId,
          },
        },
      });
    }
    return this.sender;
  }
}

function getMatchReason(matchReasons?: MatchReason[]): string | undefined {
  if (!matchReasons || matchReasons.length === 0) return;

  return matchReasons
    .map((reason) => {
      switch (reason.type) {
        case ConditionType.STATIC:
          return "Matched static conditions";
        case ConditionType.GROUP:
          return `Matched learned pattern: "${reason.groupItem.type}: ${reason.groupItem.value}"`;
        case ConditionType.CATEGORY:
          return `Matched category: "${reason.category.name}"`;
        case ConditionType.PRESET:
          return "Matched a system preset";
      }
    })
    .join(", ");
}

export async function findMatchingRules({
  rules,
  message,
  emailAccount,
  provider,
  modelType,
}: {
  rules: RuleWithActionsAndCategories[];
  message: ParsedMessage;
  emailAccount: EmailAccountWithAI;
  provider: EmailProvider;
  modelType: ModelType;
}): Promise<
  {
    rule: RuleWithActionsAndCategories;
    matchReasons?: MatchReason[];
    reason?: string;
  }[]
> {
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
      const coldEmailRuleWithCategories = await prisma.rule.findUniqueOrThrow({
        where: { id: coldEmailRule.id },
        include: { actions: true, categoryFilters: true },
      });

      return [
        {
          rule: coldEmailRuleWithCategories,
          matchReasons: [],
          reason: coldEmailResult.reason,
        },
      ];
    }
  }

  // Filter out cold email rule which was already checked above
  const rulesWithoutColdEmail = rules.filter(
    (rule) => rule.systemType !== SystemType.COLD_EMAIL,
  );

  const results = await findMatchingRuleWithReasons(
    rulesWithoutColdEmail,
    message,
    emailAccount,
    provider,
    modelType,
  );
  return results.map((result) => ({
    ...result,
    reason: result.reason || getMatchReason(result.matchReasons || []),
  }));
}

async function findMatchingRuleWithReasons(
  rules: RuleWithActionsAndCategories[],
  message: ParsedMessage,
  emailAccount: EmailAccountWithAI,
  provider: EmailProvider,
  modelType: ModelType,
): Promise<
  {
    rule: RuleWithActionsAndCategories;
    matchReasons?: MatchReason[];
    reason?: string;
  }[]
> {
  const isThread = provider.isReplyInThread(message);

  const { match, matchReasons, potentialMatches } =
    await findPotentialMatchingRules({
      rules,
      message,
      isThread,
      provider,
    });

  if (match) return [{ rule: match, matchReasons }];

  if (potentialMatches?.length) {
    const result = await aiChooseRule({
      email: getEmailForLLM(message),
      rules: potentialMatches,
      emailAccount,
      modelType,
    });

    return result.rules.map((rule) => ({
      rule,
      reason: result.reason,
    }));
  }

  return [];
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
  rule: RuleWithActionsAndCategories,
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

function matchesCategoryRule(
  rule: RuleWithActionsAndCategories,
  sender: { categoryId: string | null } | null,
) {
  if (!rule.categoryFilterType || rule.categoryFilters.length === 0)
    return true;

  if (!sender) return false;

  const matchedFilter = rule.categoryFilters.find(
    (c) => c.id === sender.categoryId,
  );

  if (
    (rule.categoryFilterType === CategoryFilterType.INCLUDE &&
      !matchedFilter) ||
    (rule.categoryFilterType === CategoryFilterType.EXCLUDE && matchedFilter)
  ) {
    return false;
  }

  return matchedFilter;
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
