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
  RuleType,
  type User,
} from "@prisma/client";
import prisma from "@/utils/prisma";
import { aiChooseRule } from "@/utils/ai/choose-rule/ai-choose-rule";
import { getEmailForLLM } from "@/utils/get-email-from-message";
import { isReplyInThread } from "@/utils/thread";
import type { UserAIFields } from "@/utils/llms/types";
import { createScopedLogger } from "@/utils/logger";
import type {
  MatchReason,
  MatchingRuleResult,
} from "@/utils/ai/choose-rule/types";

const logger = createScopedLogger("match-rules");

// if we find a match, return it
// if we don't find a match, return the potential matches
// ai rules need further processing to determine if they match

async function findPotentialMatchingRules({
  rules,
  message,
  isThread,
}: {
  rules: RuleWithActionsAndCategories[];
  message: ParsedMessage;
  isThread: boolean;
}): Promise<MatchingRuleResult> {
  const potentialMatches: (RuleWithActionsAndCategories & {
    instructions: string;
  })[] = [];

  // groups singleton
  let groups: Awaited<ReturnType<typeof getGroupsWithRules>>;
  // only load once and only when needed
  async function getGroups(userId: string) {
    if (!groups) groups = await getGroupsWithRules(userId);
    return groups;
  }

  // sender singleton
  let sender: { categoryId: string | null } | null | undefined;
  async function getSender(userId: string) {
    if (typeof sender === "undefined") {
      sender = await prisma.newsletter.findUnique({
        where: {
          email_userId: { email: message.headers.from, userId },
        },
        select: { categoryId: true },
      });
    }
    return sender;
  }

  // loop through rules and check if they match
  for (const rule of rules) {
    const { runOnThreads, conditionalOperator: operator } = rule;

    // skip if not thread and not run on threads
    if (isThread && !runOnThreads) continue;

    const conditionTypes = getConditionTypes(rule);
    const matchReasons: MatchReason[] = [];

    // group - ignores conditional operator
    // if a match is found, return it
    if (rule.groupId) {
      const { matchingItem, group } = await matchesGroupRule(
        rule,
        await getGroups(rule.userId),
        message,
      );
      if (matchingItem) {
        matchReasons.push({
          type: RuleType.GROUP,
          groupItem: matchingItem,
          group,
        });

        return { match: rule, matchReasons };
      }
    }

    // Regular conditions:
    const unmatchedConditions = new Set<RuleType>(
      Object.keys(conditionTypes) as RuleType[],
    );

    // static
    if (conditionTypes.STATIC) {
      const match = matchesStaticRule(rule, message);
      if (match) {
        unmatchedConditions.delete(RuleType.STATIC);
        matchReasons.push({ type: RuleType.STATIC });
        if (operator === LogicalOperator.OR || !unmatchedConditions.size)
          return { match: rule, matchReasons };
      } else {
        // no match, so can't be a match with AND
        if (operator === LogicalOperator.AND) continue;
      }
    }

    // category
    if (conditionTypes.CATEGORY) {
      const matchedCategory = await matchesCategoryRule(
        rule,
        await getSender(rule.userId),
      );
      if (matchedCategory) {
        unmatchedConditions.delete(RuleType.CATEGORY);
        if (typeof matchedCategory !== "boolean") {
          matchReasons.push({
            type: RuleType.CATEGORY,
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

    // ai
    // we'll need to run the LLM later to determine if it matches
    if (conditionTypes.AI && isAIRule(rule)) {
      potentialMatches.push(rule);
    }
  }

  return { potentialMatches };
}

function getMatchReason(matchReasons?: MatchReason[]): string | undefined {
  if (!matchReasons || matchReasons.length === 0) return;

  return matchReasons
    .map((reason) => {
      switch (reason.type) {
        case RuleType.STATIC:
          return "Matched static conditions";
        case RuleType.GROUP:
          return `Matched group item: "${reason.groupItem.type}: ${reason.groupItem.value}"`;
        case RuleType.CATEGORY:
          return `Matched category: "${reason.category.name}"`;
      }
    })
    .join(", ");
}

export async function findMatchingRule(
  rules: RuleWithActionsAndCategories[],
  message: ParsedMessage,
  user: Pick<User, "id" | "email" | "about"> & UserAIFields,
) {
  const result = await findMatchingRuleWithReasons(rules, message, user);
  return {
    ...result,
    reason: result.reason || getMatchReason(result.matchReasons || []),
  };
}

async function findMatchingRuleWithReasons(
  rules: RuleWithActionsAndCategories[],
  message: ParsedMessage,
  user: Pick<User, "id" | "email" | "about"> & UserAIFields,
): Promise<{
  rule?: RuleWithActionsAndCategories;
  matchReasons?: MatchReason[];
  reason?: string;
}> {
  const isThread = isReplyInThread(message.id, message.threadId);
  const { match, matchReasons, potentialMatches } =
    await findPotentialMatchingRules({
      rules,
      message,
      isThread,
    });

  if (match) return { rule: match, matchReasons };

  if (potentialMatches?.length) {
    const result = await aiChooseRule({
      email: getEmailForLLM(message),
      rules: potentialMatches,
      user,
    });

    return result;
  }

  return {};
}

export function matchesStaticRule(
  rule: Pick<RuleWithActions, "from" | "to" | "subject" | "body">,
  message: ParsedMessage,
) {
  const { from, to, subject, body } = rule;

  if (!from && !to && !subject && !body) return false;

  const safeRegexTest = (pattern: string, text: string) => {
    try {
      const regexPattern = pattern.startsWith("*")
        ? // Convert *@gmail.com to .*@gmail.com
          `.*${pattern.slice(1)}`
        : pattern;

      return new RegExp(regexPattern).test(text);
    } catch (error) {
      logger.error("Invalid regex pattern", { pattern, error });
      return false;
    }
  };

  const fromMatch = from ? safeRegexTest(from, message.headers.from) : true;
  const toMatch = to ? safeRegexTest(to, message.headers.to) : true;
  const subjectMatch = subject
    ? safeRegexTest(subject, message.headers.subject)
    : true;
  const bodyMatch = body ? safeRegexTest(body, message.textPlain || "") : true;

  return fromMatch && toMatch && subjectMatch && bodyMatch;
}

async function matchesGroupRule(
  rule: RuleWithActionsAndCategories,
  groups: Awaited<ReturnType<typeof getGroupsWithRules>>,
  message: ParsedMessage,
) {
  const ruleGroup = groups.find((g) => g.rule?.id === rule.id);
  if (!ruleGroup) return { group: null, matchingItem: null };
  return findMatchingGroup(message, ruleGroup);
}

async function matchesCategoryRule(
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
