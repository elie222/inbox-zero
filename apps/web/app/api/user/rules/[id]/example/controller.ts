import type { gmail_v1 } from "@googleapis/gmail";
import { parseMessage } from "@/utils/gmail/message";
import { getMessage, getMessages } from "@/utils/gmail/message";
import type {
  MessageWithGroupItem,
  RuleWithGroup,
} from "@/app/(app)/[emailAccountId]/assistant/rule/[ruleId]/examples/types";
import { matchesStaticRule } from "@/utils/ai/choose-rule/match-rules";
import { fetchPaginatedMessages } from "@/app/api/user/group/[groupId]/messages/controller";
import {
  isGroupRule,
  isAIRule,
  isStaticRule,
  isCategoryRule,
} from "@/utils/condition";
import { LogicalOperator } from "@prisma/client";

export async function fetchExampleMessages(
  rule: RuleWithGroup,
  gmail: gmail_v1.Gmail,
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

  if (isStatic) return fetchStaticExampleMessages(rule, gmail);

  if (isGroup) {
    if (!rule.group) return [];
    const { messages } = await fetchPaginatedMessages({
      groupItems: rule.group.items,
      gmail,
    });
    return messages;
  }

  return [];
}

async function fetchStaticExampleMessages(
  rule: RuleWithGroup,
  gmail: gmail_v1.Gmail,
): Promise<MessageWithGroupItem[]> {
  let query = "";
  if (rule.from) {
    query += `from:${rule.from} `;
  }
  if (rule.to) {
    query += `to:${rule.to} `;
  }
  if (rule.subject) {
    query += `subject:${rule.subject} `;
  }

  const response = await getMessages(gmail, {
    query,
    maxResults: 50,
  });

  const messages = await Promise.all(
    (response.messages || []).map(async (message) => {
      // TODO: Use email provider to get the message which will parse it internally
      const m = await getMessage(message.id!, gmail);
      const parsedMessage = parseMessage(m);
      return parsedMessage;
    }),
  );

  // search might include messages that don't match the rule, so we filter those out
  return messages.filter((message) => matchesStaticRule(rule, message));
}
