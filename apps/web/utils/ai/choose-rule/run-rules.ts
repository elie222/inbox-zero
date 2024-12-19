import type { gmail_v1 } from "@googleapis/gmail";
import type {
  ParsedMessage,
  RuleWithActionsAndCategories,
} from "@/utils/types";
import type { UserAIFields } from "@/utils/llms/types";
import {
  ExecutedRuleStatus,
  type Prisma,
  type Rule,
  type User,
} from "@prisma/client";
import {
  chooseRuleAndExecute,
  saveExecutedRule,
  upsertExecutedRule,
} from "@/utils/ai/choose-rule/choose-and-execute";
import { emailToContent } from "@/utils/mail";
import type { ActionItem } from "@/utils/ai/actions";
import { createScopedLogger } from "@/utils/logger";
import { findPotentialMatchingRules } from "@/utils/ai/choose-rule/match-rules";
import { getActionItemsWithAiArgs } from "@/utils/ai/choose-rule/ai-choose-args";
import { executeAct } from "@/utils/ai/choose-rule/execute";

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
  isTest,
}: {
  gmail: gmail_v1.Gmail;
  message: ParsedMessage;
  rules: RuleWithActionsAndCategories[];
  isThread: boolean;
  user: Pick<User, "id" | "email" | "about"> & UserAIFields;
  isTest: boolean;
}): Promise<{
  handled: boolean;
  rule?: Rule | null;
  actionItems?: ActionItem[];
  reason?: string | null;
}> {
  const { match, potentialMatches } = await findPotentialMatchingRules({
    rules,
    message,
    isThread,
  });

  if (match) {
    return await runRule(match, message, user, gmail, isTest);
  }

  if (potentialMatches?.length) {
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
      rules: potentialMatches,
      gmail,
      user,
      isTest: false,
    });

    if (aiResponse.handled) return aiResponse;

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
  }

  return { handled: false };
}

async function runRule(
  rule: RuleWithActionsAndCategories,
  message: ParsedMessage,
  user: Pick<User, "id" | "email" | "about"> & UserAIFields,
  gmail: gmail_v1.Gmail,
  isTest: boolean,
) {
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
    selectedRule: rule,
  });

  // handle action
  const executedRule = isTest
    ? undefined
    : await saveExecutedRule(
        {
          userId: user.id,
          threadId: email.threadId,
          messageId: email.messageId,
        },
        {
          rule,
          actionItems,
        },
      );

  const shouldExecute = executedRule && rule.automate;

  if (shouldExecute) {
    await executeAct({
      gmail,
      userEmail: user.email || "",
      executedRule,
      email,
    });
  }

  return { handled: true, rule, actionItems, executedRule };
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
  const result = await runRulesOnMessage({
    gmail,
    message,
    rules,
    isThread,
    user,
    isTest: true,
  });

  return result;
}
