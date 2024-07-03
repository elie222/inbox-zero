import type { gmail_v1 } from "googleapis";
import { GroupItemType, RuleType } from "@prisma/client";
import { parseMessage } from "@/utils/mail";
import { getMessage } from "@/utils/gmail/message";
import type {
  MessageWithGroupItem,
  RuleWithGroup,
} from "@/app/(app)/automation/rule/[ruleId]/examples/types";
import { matchesStaticRule } from "@/app/api/google/webhook/static-rule";
import { extractEmailAddress } from "@/utils/email";
import { findMatchingGroupItem } from "@/utils/group/find-matching-group";

export async function fetchExampleMessages(
  rule: RuleWithGroup,
  gmail: gmail_v1.Gmail,
) {
  switch (rule.type) {
    case RuleType.STATIC:
      return fetchStaticExampleMessages(rule, gmail);
    case RuleType.GROUP:
      if (!rule.group) return [];
      return fetchGroupExampleMessages(rule.group, gmail);
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

export async function fetchGroupExampleMessages(
  group: NonNullable<RuleWithGroup["group"]>,
  gmail: gmail_v1.Gmail,
): Promise<MessageWithGroupItem[]> {
  const items = group.items || [];

  let responseMessages: gmail_v1.Schema$Message[] = [];

  // we slice to avoid the query being too long or it won't work
  const froms = items
    .filter((item) => item.type === GroupItemType.FROM)
    .slice(0, 50);

  if (froms.length > 0) {
    const q = `from:(${froms
      .map((item) => `"${extractEmailAddress(item.value)}"`)
      .join(" OR ")}) `;

    const responseFrom = await gmail.users.messages.list({
      userId: "me",
      maxResults: 50,
      q,
    });

    if (responseFrom.data.messages)
      responseMessages = responseFrom.data.messages;
  }

  const subjects = items
    .filter((item) => item.type === GroupItemType.SUBJECT)
    .slice(0, 50);

  if (subjects.length > 0) {
    const q = `subject:(${subjects
      .map((item) => `"${item.value}"`)
      .join(" OR ")})`;

    const responseSubject = await gmail.users.messages.list({
      userId: "me",
      maxResults: 50,
      q,
    });

    if (responseSubject.data.messages) {
      responseMessages = [
        ...responseMessages,
        ...responseSubject.data.messages,
      ];
    }
  }

  const messages = await Promise.all(
    responseMessages.map(async (message) => {
      const m = await getMessage(message.id!, gmail);
      const parsedMessage = parseMessage(m);

      const matchingGroupItem = findMatchingGroupItem(
        parsedMessage.headers,
        group.items,
      );

      return {
        ...parsedMessage,
        matchingGroupItem,
      };
    }),
  );

  // search might include messages that don't match the rule, so we filter those out
  return messages.filter((message) => message.matchingGroupItem);
}
