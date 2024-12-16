import type { gmail_v1 } from "@googleapis/gmail";
import {
  isDefined,
  type ParsedMessage,
  type RuleWithActionsAndCategories,
} from "@/utils/types";
import { handleGroupRule } from "@/app/api/google/webhook/group-rule";
import { handleStaticRule } from "@/app/api/google/webhook/static-rule";
import type { UserAIFields } from "@/utils/llms/types";
import {
  CategoryFilterType,
  ExecutedRuleStatus,
  type Newsletter,
  type Prisma,
  type Rule,
  RuleType,
  type User,
} from "@prisma/client";
import {
  chooseRuleAndExecute,
  upsertExecutedRule,
} from "@/utils/ai/choose-rule/choose-and-execute";
import { emailToContent } from "@/utils/mail";
import type { ActionItem } from "@/utils/ai/actions";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("ai-run-rules");

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
  rules: RuleWithActionsAndCategories[];
  isThread: boolean;
  user: Pick<User, "id" | "email" | "about"> & UserAIFields;
}): Promise<{ handled: boolean }> {
  // 1. Check if a static rule matches
  // 2. Check if a group rule matches
  // 3. Check if an ai rule matches

  const applicableRules = await getApplicableRules({
    rules,
    message,
    isThread,
    userId: user.id,
  });

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

  logger.info(
    `No rules matched. ${user.email} ${message.threadId} ${message.id}`,
  );
  logger.trace(aiResponse);

  // no rules matched
  await saveSkippedExecutedRule({
    userId: user.id,
    threadId: message.threadId,
    messageId: message.id,
    reason: aiResponse?.reason,
  });

  return { handled: false };
}

async function getApplicableRules({
  rules,
  message,
  isThread,
  userId,
}: {
  rules: RuleWithActionsAndCategories[];
  message: ParsedMessage;
  isThread: boolean;
  userId: string;
}) {
  let sender: Pick<Newsletter, "categoryId"> | null = null;

  const applicableRules = await Promise.all(
    rules.map(async (rule) => {
      if (isThread && !rule.runOnThreads) return null;

      // check category filter
      if (rule.categoryFilterType && rule.categoryFilters.length > 0) {
        // lazy fetch sender
        if (!sender) {
          sender = await prisma.newsletter.findUnique({
            where: { email_userId: { email: message.headers.from, userId } },
            select: { categoryId: true },
          });
        }

        const isIncluded = rule.categoryFilters.some(
          (c) => c.id === sender?.categoryId,
        );

        if (
          (rule.categoryFilterType === CategoryFilterType.INCLUDE &&
            !isIncluded) ||
          (rule.categoryFilterType === CategoryFilterType.EXCLUDE && isIncluded)
        ) {
          return null;
        }
      }

      return rule;
    }),
  );

  return applicableRules.filter(isDefined);
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
  const data: Prisma.ExecutedRuleCreateInput = {
    threadId,
    messageId,
    automated: true,
    reason,
    status: ExecutedRuleStatus.SKIPPED,
    user: { connect: { id: userId } },
  };

  await upsertExecutedRule({
    userId,
    threadId,
    messageId,
    data,
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
  rules: RuleWithActionsAndCategories[];
  isThread: boolean;
  user: Pick<User, "id" | "email" | "about"> & UserAIFields;
}): Promise<TestResult> {
  const applicableRules = isThread
    ? rules.filter((r) => r.runOnThreads)
    : rules;

  logger.info("Found applicable rules", { count: applicableRules.length });

  // static rules
  const staticRule = await handleStaticRule({
    rules: applicableRules,
    message,
    user,
    gmail,
    isTest: true,
  });

  if (staticRule.handled) {
    logger.info("Static rule matched");
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
    logger.info("Group rule matched");
    return {
      rule: groupRule.rule,
      actionItems: groupRule.actionItems,
      reason: null,
    };
  }

  // ai rules
  const aiRules = applicableRules.filter((r) => r.type === RuleType.AI);

  logger.info("Found ai rules", { count: aiRules.length });

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

  logger.info("AI rule matched", { matched: !!plan.rule });

  return plan;
}
