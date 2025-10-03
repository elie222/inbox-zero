import type {
  MessageWithGroupItem,
  RuleWithGroup,
} from "@/app/(app)/[emailAccountId]/assistant/rule/[ruleId]/examples/types";
import {
  matchesStaticRule,
  splitEmailPatterns,
} from "@/utils/ai/choose-rule/match-rules";
import { fetchPaginatedMessages } from "@/app/api/user/group/[groupId]/messages/controller";
import {
  isGroupRule,
  isAIRule,
  isStaticRule,
  isCategoryRule,
} from "@/utils/condition";
import { LogicalOperator } from "@prisma/client";
import type { EmailProvider } from "@/utils/email/types";

export async function fetchExampleMessages(
  rule: RuleWithGroup,
  emailProvider: EmailProvider,
) {
  const isStatic = isStaticRule(rule);
  const isGroup = isGroupRule(rule);
  const isAI = isAIRule(rule);
  const isCategory = isCategoryRule(rule);

  if (isAI || isCategory) return [];

  // if AND and more than 1 condition, return []
  // TODO: handle multiple conditions properly and return real examples
  const conditions = [isStatic, isGroup, isAI, isCategory];
  const trueConditionsCount = conditions.filter(Boolean).length;

  if (
    trueConditionsCount > 1 &&
    rule.conditionalOperator === LogicalOperator.AND
  )
    return [];

  if (isStatic) return fetchStaticExampleMessages(rule, emailProvider);

  if (isGroup) {
    if (!rule.group) return [];

    const { messages } = await fetchPaginatedMessages({
      emailProvider,
      groupItems: rule.group.items,
    });
    return messages;
  }

  return [];
}

async function fetchStaticExampleMessages(
  rule: RuleWithGroup,
  emailProvider: EmailProvider,
): Promise<MessageWithGroupItem[]> {
  // Build structured query options instead of provider-specific query strings
  const options: Parameters<EmailProvider["getMessagesByFields"]>[0] = {
    maxResults: 50,
  };

  if (rule.from) {
    options.froms = splitEmailPatterns(rule.from);
  }
  if (rule.to) {
    options.tos = splitEmailPatterns(rule.to);
  }
  if (rule.subject) {
    options.subjects = [rule.subject];
  }

  const response = await emailProvider.getMessagesByFields(options);

  // search might include messages that don't match the rule, so we filter those out
  return response.messages.filter((message) =>
    matchesStaticRule(rule, message),
  );
}
