import { gmail_v1 } from "googleapis";
import {
  excuteRuleActions,
  getFunctionsFromRules,
} from "@/app/api/ai/act/controller";
import { ParsedMessage, RuleWithActions } from "@/utils/types";
import { User } from "@prisma/client";
import {
  getActionItemsFromAiArgsResponse,
  getArgsAiResponse,
} from "@/app/api/ai/act/ai-choose-args";
import { emailToContent } from "@/utils/mail";

export async function handleStaticRule({
  message,
  user,
  gmail,
  rules,
}: {
  rules: RuleWithActions[];
  message: ParsedMessage;
  user: Pick<
    User,
    "id" | "email" | "aiModel" | "aiProvider" | "openAIApiKey" | "about"
  >;
  gmail: gmail_v1.Gmail;
}): Promise<{ handled: boolean }> {
  const staticRule = findStaticRule(rules, message);
  if (!staticRule) {
    return { handled: false };
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
    functions.rulesWithProperties[0].shouldAiGenerateArgs;

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
  await excuteRuleActions(
    {
      gmail,
      user,
      allowExecute: true,
      email,
    },
    {
      rule: staticRule,
      actionItems,
    },
  );

  return { handled: true };
}

function findStaticRule(
  applicableRules: RuleWithActions[],
  message: ParsedMessage,
): RuleWithActions | null {
  for (const rule of applicableRules) {
    if (matchesStaticRule(rule, message)) return rule;
  }
  return null;
}

export function matchesStaticRule(
  rule: Pick<RuleWithActions, "from" | "to" | "subject" | "body">,
  message: ParsedMessage,
) {
  const { from, to, subject, body } = rule;

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
