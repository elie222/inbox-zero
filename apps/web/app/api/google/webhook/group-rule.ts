import type { gmail_v1 } from "@googleapis/gmail";
import type { ParsedMessage } from "@/utils/types";
import type { User } from "@prisma/client";
import { emailToContent } from "@/utils/mail";
import { getActionItemsWithAiArgs } from "@/utils/ai/choose-rule/ai-choose-args";
import {
  findMatchingGroup,
  getGroupsWithRules,
} from "@/utils/group/find-matching-group";
import { executeAct } from "@/utils/ai/choose-rule/execute";
import { saveExecutedRule } from "@/utils/ai/choose-rule/choose-and-execute";

export async function handleGroupRule({
  message,
  user,
  gmail,
  isThread,
  isTest,
}: {
  message: ParsedMessage;
  user: Pick<
    User,
    "id" | "email" | "aiModel" | "aiProvider" | "aiApiKey" | "about"
  >;
  gmail: gmail_v1.Gmail;
  isThread: boolean;
  isTest: boolean;
}) {
  const groups = await getGroupsWithRules(user.id);

  // check if matches group
  const match = findMatchingGroup(message, groups);
  if (!match) return { handled: false, rule: null };
  if (!match.rule) return { handled: true, rule: null };
  if (isThread && !match.rule.runOnThreads)
    return { handled: true, rule: null };

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

  // get action items with args
  const actionItems = await getActionItemsWithAiArgs({
    email,
    user,
    selectedRule: match.rule,
  });

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
          rule: match.rule,
          actionItems,
        },
      );

  const shouldExecute = executedRule && match.rule.automate;

  if (shouldExecute) {
    await executeAct({
      gmail,
      userEmail: user.email || "",
      executedRule,
      email,
    });
  }

  return {
    handled: true,
    rule: match.rule,
    executedRule,
    actionItems,
  };
}
