import type { gmail_v1 } from "@googleapis/gmail";
import type { ParsedMessage, RuleWithActions } from "@/utils/types";
import { RuleType, type User } from "@prisma/client";
import {
  getActionsWithParameters,
  getArgsAiResponse,
} from "@/utils/ai/choose-rule/ai-choose-args";
import { emailToContent } from "@/utils/mail";
import { saveExecutedRule } from "@/utils/ai/choose-rule/choose-and-execute";
import { executeAct } from "@/utils/ai/choose-rule/execute";

export async function handleStaticRule({
  message,
  user,
  gmail,
  rules,
  isTest,
}: {
  rules: RuleWithActions[];
  message: ParsedMessage;
  user: Pick<
    User,
    "id" | "email" | "aiModel" | "aiProvider" | "aiApiKey" | "about"
  >;
  gmail: gmail_v1.Gmail;
  isTest: boolean;
}) {
  const staticRule = findStaticRule(rules, message);
  if (!staticRule) {
    return { handled: false, rule: null };
  }

  const email = {
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
    content: emailToContent({
      textHtml: message.textHtml || null,
      textPlain: message.textPlain || null,
      snippet: message.snippet || null,
    }),
  };

  // generate args
  const shouldAiGenerateArgs =
    getActionsWithParameters(staticRule.actions).length > 0;
  const aiArgsResponse = shouldAiGenerateArgs
    ? await getArgsAiResponse({
        email,
        selectedRule: staticRule,
        user,
      })
    : staticRule.actions;

  const actionItems = aiArgsResponse || staticRule.actions;

  // handle action
  // TODO isThread check to skip
  const executedRule = isTest
    ? undefined
    : await saveExecutedRule(
        {
          userId: user.id,
          threadId: email.threadId,
          messageId: email.messageId,
        },
        {
          rule: staticRule,
          actionItems,
        },
      );

  const shouldExecute = executedRule && staticRule.automate;

  if (shouldExecute) {
    await executeAct({
      gmail,
      userEmail: user.email || "",
      executedRule,
      email,
    });
  }

  return { handled: true, rule: staticRule, actionItems, executedRule };
}

function findStaticRule(
  rules: RuleWithActions[],
  message: ParsedMessage,
): RuleWithActions | null {
  for (const rule of rules.filter((rule) => rule.type === RuleType.STATIC)) {
    if (matchesStaticRule(rule, message)) return rule;
  }
  return null;
}

export function matchesStaticRule(
  rule: Pick<RuleWithActions, "from" | "to" | "subject" | "body">,
  message: ParsedMessage,
) {
  const { from, to, subject, body } = rule;

  if (!from && !to && !subject && !body) return false;

  const safeRegexTest = (pattern: string, text: string) => {
    try {
      return new RegExp(pattern).test(text);
    } catch (error) {
      console.error(`Invalid regex pattern: ${pattern}`, error);
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
