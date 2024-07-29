import type { gmail_v1 } from "googleapis";
import { RuleType } from "@prisma/client";
import { parseMessage } from "@/utils/mail";
import { getMessage } from "@/utils/gmail/message";
import type {
  MessageWithGroupItem,
  RuleWithGroup,
} from "@/app/(app)/automation/rule/[ruleId]/examples/types";
import { matchesStaticRule } from "@/app/api/google/webhook/static-rule";
import { fetchPaginatedMessages } from "@/app/api/user/group/[groupId]/messages/controller";

export async function fetchExampleMessages(
  rule: RuleWithGroup,
  gmail: gmail_v1.Gmail,
) {
  switch (rule.type) {
    case RuleType.STATIC:
      return fetchStaticExampleMessages(rule, gmail);
    case RuleType.GROUP:
      if (!rule.group) return [];
      const { messages } = await fetchPaginatedMessages({
        groupItems: rule.group.items,
        gmail,
      });
      return messages;
    case RuleType.AI:
      return [];
  }
}

async function fetchStaticExampleMessages(
  rule: RuleWithGroup,
  gmail: gmail_v1.Gmail,
): Promise<MessageWithGroupItem[]> {
  let q = "";
  if (rule.from) {
    q += `from:${rule.from} `;
  }
  if (rule.to) {
    q += `to:${rule.to} `;
  }
  if (rule.subject) {
    q += `subject:${rule.subject} `;
  }

  const response = await gmail.users.messages.list({
    userId: "me",
    maxResults: 50,
    q,
  });

  const messages = await Promise.all(
    (response.data.messages || []).map(async (message) => {
      const m = await getMessage(message.id!, gmail);
      const parsedMessage = parseMessage(m);
      return parsedMessage;
    }),
  );

  // search might include messages that don't match the rule, so we filter those out
  return messages.filter((message) => matchesStaticRule(rule, message));
}
