import type { gmail_v1 } from "googleapis";
import type { ParsedMessage, RuleWithActions } from "@/utils/types";
import { handleGroupRule } from "@/app/api/google/webhook/group-rule";
import { handleStaticRule } from "@/app/api/google/webhook/static-rule";
import type { UserAIFields } from "@/utils/llms/types";
import {
  ExecutedRuleStatus,
  type Rule,
  RuleType,
  type User,
} from "@prisma/client";
import { chooseRuleAndExecute } from "@/utils/ai/choose-rule/choose-and-execute";
import { emailToContent } from "@/utils/mail";
import prisma from "@/utils/prisma";
import type { ActionItem } from "@/utils/ai/actions";

export type TestResult = {
  rule?: Rule | null;
  actionItems?: ActionItem[];
  reason?: string | null;
};

export async function runRulesOnMessage({
  gmail,
  message,
  rules,
  isThread,
  user,
}: {
  gmail: gmail_v1.Gmail;
  message: ParsedMessage;
  rules: RuleWithActions[];
  isThread: boolean;
  user: Pick<User, "id" | "email" | "about"> & UserAIFields;
}): Promise<{ handled: boolean }> {
  // 1. Check if a static rule matches
  // 2. Check if a group rule matches
  // 3. Check if an ai rule matches

  const applicableRules = isThread
    ? rules.filter((r) => r.runOnThreads)
    : rules;

  // static rules
  const staticRule = await handleStaticRule({
    rules: applicableRules,
    message,
    user,
    gmail,
    isTest: false,
  });

  if (staticRule.handled) return { handled: true };

  // group rules
  const groupRule = await handleGroupRule({
    message,
    user,
    gmail,
    isThread,
    isTest: false,
  });

  if (groupRule.handled) return { handled: true };

  // ai rules
  const aiRules = applicableRules.filter((r) => r.type === RuleType.AI);

  const content = emailToContent({
    textHtml: message.textHtml || null,
    textPlain: message.textPlain || null,
    snippet: message.snippet,
  });
  const aiResponse = await chooseRuleAndExecute({
    email: {
      from: message.headers.from,
      replyTo: message.headers["reply-to"],
      cc: message.headers.cc,
      subject: message.headers.subject,
      content,
      threadId: message.threadId,
      messageId: message.id,
      headerMessageId: message.headers["message-id"] || "",
    },
    rules: aiRules,
    gmail,
    user,
    isTest: false,
  });

  if (aiResponse.handled) return { handled: true };

  console.log(
    `No rules matched. ${user.email} ${message.threadId} ${message.id}`,
  );

  // no rules matched
  await saveSkippedExecutedRule({
    userId: user.id,
    threadId: message.threadId,
    messageId: message.id,
    reason: aiResponse?.reason,
  });

  return { handled: false };
}

async function saveSkippedExecutedRule({
  userId,
  threadId,
  messageId,
  reason,
}: {
  userId: string;
  threadId: string;
  messageId: string;
  reason?: string;
}) {
  await prisma.executedRule.upsert({
    where: {
      unique_user_thread_message: {
        userId,
        threadId,
        messageId,
      },
    },
    // `automated` only relevent when we have a rule
    create: {
      threadId,
      messageId,
      automated: true,
      reason,
      status: ExecutedRuleStatus.SKIPPED,
      user: { connect: { id: userId } },
    },
    update: {
      threadId,
      messageId,
      automated: true,
      reason,
      status: ExecutedRuleStatus.SKIPPED,
      user: { connect: { id: userId } },
    },
  });
}

export async function testRulesOnMessage({
  gmail,
  message,
  rules,
  isThread,
  user,
}: {
  gmail: gmail_v1.Gmail;
  message: ParsedMessage;
  rules: RuleWithActions[];
  isThread: boolean;
  user: Pick<User, "id" | "email" | "about"> & UserAIFields;
}): Promise<TestResult> {
  const applicableRules = isThread
    ? rules.filter((r) => r.runOnThreads)
    : rules;

  // static rules
  const staticRule = await handleStaticRule({
    rules: applicableRules,
    message,
    user,
    gmail,
    isTest: true,
  });

  if (staticRule.handled) {
    return {
      rule: staticRule.rule,
      actionItems: staticRule.actionItems,
      reason: null,
    };
  }

  // group rules
  const groupRule = await handleGroupRule({
    message,
    user,
    gmail,
    isThread,
    isTest: true,
  });

  if (groupRule.handled) {
    return {
      rule: groupRule.rule,
      actionItems: groupRule.actionItems,
      reason: null,
    };
  }

  // ai rules
  const aiRules = applicableRules.filter((r) => r.type === RuleType.AI);

  const content = emailToContent({
    textHtml: message.textHtml || null,
    textPlain: message.textPlain || null,
    snippet: message.snippet,
  });
  const plan = await chooseRuleAndExecute({
    email: {
      from: message.headers.from,
      replyTo: message.headers["reply-to"],
      cc: message.headers.cc,
      subject: message.headers.subject,
      content,
      threadId: message.threadId,
      messageId: message.id,
      headerMessageId: message.headers["message-id"] || "",
    },
    rules: aiRules,
    gmail,
    user,
    isTest: true,
  });

  return plan;
}
