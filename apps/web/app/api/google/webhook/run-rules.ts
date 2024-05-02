import { gmail_v1 } from "googleapis";
import { planOrExecuteAct } from "@/app/api/ai/act/controller";
import { type ParsedMessage, type RuleWithActions } from "@/utils/types";
import { handleGroupRule } from "@/app/api/google/webhook/group-rule";
import { handleStaticRule } from "@/app/api/google/webhook/static-rule";
import { UserAIFields } from "@/utils/llms/types";
import { RuleType, User } from "@prisma/client";

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
}) {
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

  if (staticRule.handled) return;

  // group rules
  const groupRule = await handleGroupRule({
    message,
    user,
    gmail,
    isThread,
    isTest: false,
  });

  if (groupRule.handled) return;

  // ai rules
  if (!message.textHtml && !message.textPlain && !message.snippet) {
    console.log("Skipping. No text found.");
    return;
  }

  const aiRules = applicableRules.filter((r) => r.type === RuleType.AI);

  if (aiRules.length === 0) {
    console.log(`Skipping thread. No AI rules.`);
    return;
  }

  const plan = await planOrExecuteAct({
    email: {
      from: message.headers.from,
      replyTo: message.headers["reply-to"],
      cc: message.headers.cc,
      subject: message.headers.subject,
      textHtml: message.textHtml || null,
      textPlain: message.textPlain || null,
      snippet: message.snippet,
      threadId: message.threadId,
      messageId: message.id,
      headerMessageId: message.headers["message-id"] || "",
    },
    rules: applicableRules,
    gmail,
    user,
    allowExecute: true,
  });

  return plan;
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
}) {
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
      reason: null,
      actionItems: staticRule.actionItems,
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
      reason: null,
      actionItems: groupRule.actionItems,
    };
  }

  // ai rules
  if (!message.textHtml && !message.textPlain && !message.snippet) {
    return { rule: null, reason: null, actionItems: [] };
  }

  const aiRules = applicableRules.filter((r) => r.type === RuleType.AI);

  if (aiRules.length === 0) {
    return { rule: null, reason: null, actionItems: [] };
  }

  const plan = await planOrExecuteAct({
    email: {
      from: message.headers.from,
      replyTo: message.headers["reply-to"],
      cc: message.headers.cc,
      subject: message.headers.subject,
      textHtml: message.textHtml || null,
      textPlain: message.textPlain || null,
      snippet: message.snippet,
      threadId: message.threadId,
      messageId: message.id,
      headerMessageId: message.headers["message-id"] || "",
    },
    rules: applicableRules,
    gmail,
    user,
    allowExecute: true,
  });

  return plan;
}
