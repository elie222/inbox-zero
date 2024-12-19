import { matchesStaticRule } from "@/app/api/google/webhook/static-rule";
import { getConditionTypes } from "@/utils/condition";
import {
  findMatchingGroup,
  getGroupsWithRules,
} from "@/utils/group/find-matching-group";
import type {
  ParsedMessage,
  RuleWithActionsAndCategories,
} from "@/utils/types";
import { CategoryFilterType, LogicalOperator } from "@prisma/client";
import prisma from "@/utils/prisma";

// if we find a match, return it
// if we don't find a match, return the potential matches
// ai rules need further processing to determine if they match
type MatchingRuleResult = {
  match?: RuleWithActionsAndCategories;
  potentialMatches?: RuleWithActionsAndCategories[];
};

export async function findPotentialMatchingRules({
  rules,
  message,
  isThread,
}: {
  rules: RuleWithActionsAndCategories[];
  message: ParsedMessage;
  isThread: boolean;
}): Promise<MatchingRuleResult> {
  const potentialMatches: RuleWithActionsAndCategories[] = [];

  // singleton
  let groups: Awaited<ReturnType<typeof getGroupsWithRules>> = [];
  // only load once and only when needed
  async function getGroups(rule: RuleWithActionsAndCategories) {
    if (!groups) groups = await getGroupsWithRules(rule.userId);
    return groups;
  }

  // loop through rules and check if they match
  for (const rule of rules) {
    const { runOnThreads, conditionalOperator: operator } = rule;

    // skip if not thread and not run on threads
    if (isThread && !runOnThreads) continue;

    const conditionTypes = getConditionTypes(rule);
    const unmatchedConditions = new Set<string>(Object.keys(conditionTypes));

    // static
    if (conditionTypes.STATIC) {
      const match = matchesStaticRule(rule, message);
      if (match) {
        unmatchedConditions.delete("STATIC");
        if (operator === LogicalOperator.OR || !unmatchedConditions.size)
          return { match: rule };
      } else {
        // no match, so can't be a match with AND
        if (operator === LogicalOperator.AND) continue;
      }
    }

    // group
    if (conditionTypes.GROUP) {
      const match = await matchesGroupRule(await getGroups(rule), message);
      if (match) {
        unmatchedConditions.delete("GROUP");
        if (operator === LogicalOperator.OR || !unmatchedConditions.size)
          return { match: rule };
      } else {
        // no match, so can't be a match with AND
        if (operator === LogicalOperator.AND) continue;
      }
    }

    // category
    if (conditionTypes.CATEGORY) {
      const match = await matchesCategoryRule(rule, message, rule.userId);
      if (match) {
        unmatchedConditions.delete("CATEGORY");
        if (operator === LogicalOperator.OR || !!unmatchedConditions.size)
          return { match: rule };
      } else {
        // no match, so can't be a match with AND
        if (operator === LogicalOperator.AND) continue;
      }
    }

    // ai
    // we'll need to run the LLM later to determine if it matches
    if (conditionTypes.AI) {
      potentialMatches.push(rule);
    }
  }

  return { potentialMatches };
}

async function matchesGroupRule(
  groups: Awaited<ReturnType<typeof getGroupsWithRules>>,
  message: ParsedMessage,
) {
  const match = findMatchingGroup(message, groups);
  return !!match;
}

async function matchesCategoryRule(
  rule: RuleWithActionsAndCategories,
  message: ParsedMessage,
  userId: string,
) {
  if (!rule.categoryFilterType || rule.categoryFilters.length === 0) {
    return true;
  }

  const sender = await prisma.newsletter.findUnique({
    where: { email_userId: { email: message.headers.from, userId } },
    select: { categoryId: true },
  });

  const isIncluded = rule.categoryFilters.some(
    (c) => c.id === sender?.categoryId,
  );

  if (
    (rule.categoryFilterType === CategoryFilterType.INCLUDE && !isIncluded) ||
    (rule.categoryFilterType === CategoryFilterType.EXCLUDE && isIncluded)
  ) {
    return false;
  }

  return true;
}
