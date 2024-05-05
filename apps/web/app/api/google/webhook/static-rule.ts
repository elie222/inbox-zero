import { gmail_v1 } from "googleapis";
import { getFunctionsFromRules } from "@/utils/ai/choose-rule/functions-from-rules";
import { ParsedMessage, RuleWithActions } from "@/utils/types";
import { RuleType, User } from "@prisma/client";
import {
  getActionItemsFromAiArgsResponse,
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
    "id" | "email" | "aiModel" | "aiProvider" | "openAIApiKey" | "about"
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

  const functions = getFunctionsFromRules({ rules: [staticRule] });
  const shouldAiGenerateArgs =
    functions.rulesWithFunctions[0].shouldAiGenerateArgs;

  // generate args
  const aiArgsResponse = shouldAiGenerateArgs
    ? await getArgsAiResponse({
        email,
        selectedFunction: functions.functions[0],
        user,
      })
    : undefined;

  const actionItems = getActionItemsFromAiArgsResponse(
    aiArgsResponse,
    staticRule.actions,
  );

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

  const fromMatch = from ? new RegExp(from).test(message.headers.from) : true;
  const toMatch = to ? new RegExp(to).test(message.headers.to) : true;
  const subjectMatch = subject
    ? new RegExp(subject).test(message.headers.subject)
    : true;
  const bodyMatch = body
    ? new RegExp(body).test(message.textPlain || "")
    : true;

  return fromMatch && toMatch && subjectMatch && bodyMatch;
}
