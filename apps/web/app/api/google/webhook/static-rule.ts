import { gmail_v1 } from "googleapis";
import { excuteRuleActions } from "@/app/api/ai/act/controller";
import { ParsedMessage, RuleWithActions } from "@/utils/types";
import { User } from "@prisma/client";

export async function handleStaticRule({
  message,
  user,
  gmail,
  rules,
}: {
  rules: RuleWithActions[];
  message: ParsedMessage;
  user: Pick<User, "id" | "email">;
  gmail: gmail_v1.Gmail;
}): Promise<{ handled: boolean }> {
  const staticRule = findStaticRule(rules, message);
  if (!staticRule) {
    return { handled: false };
  }

  // handle action
  await excuteRuleActions(
    {
      gmail,
      userId: user.id,
      userEmail: user.email || "",
      allowExecute: true,
      email: {
        from: message.headers.from,
        to: message.headers.to,
        subject: message.headers.subject,
        headerMessageId: message.headers["message-id"] || "",
        messageId: message.id,
        snippet: message.snippet,
        textHtml: message.textHtml || null,
        textPlain: message.textPlain || null,
        threadId: message.threadId,
        cc: message.headers.cc || undefined,
        date: message.headers.date,
        references: message.headers.references,
        replyTo: message.headers["reply-to"],
      },
    },
    {
      rule: staticRule,
      actionItems: staticRule.actions,
    },
  );

  return { handled: true };
}

function findStaticRule(
  applicableRules: RuleWithActions[],
  parsedMessage: ParsedMessage,
): RuleWithActions | null {
  for (const rule of applicableRules) {
    const fromMatch = rule.from
      ? new RegExp(rule.from).test(parsedMessage.headers.from)
      : true;
    const toMatch = rule.to
      ? new RegExp(rule.to).test(parsedMessage.headers.to)
      : true;
    const subjectMatch = rule.subject
      ? new RegExp(rule.subject).test(parsedMessage.headers.subject)
      : true;
    const bodyMatch = rule.body
      ? new RegExp(rule.body).test(parsedMessage.textPlain || "")
      : true;

    if (fromMatch && toMatch && subjectMatch && bodyMatch) {
      return rule;
    }
  }
  return null;
}
