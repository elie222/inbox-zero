import type { gmail_v1 } from "@googleapis/gmail";
import { after } from "next/server";
import type {
  ParsedMessage,
  RuleWithActionsAndCategories,
} from "@/utils/types";
import type { EmailAccountWithAI } from "@/utils/llms/types";
import {
  ExecutedRuleStatus,
  Prisma,
  type Rule,
  type User,
} from "@prisma/client";
import type { ActionItem } from "@/utils/ai/types";
import { findMatchingRule } from "@/utils/ai/choose-rule/match-rules";
import { getActionItemsWithAiArgs } from "@/utils/ai/choose-rule/choose-args";
import { executeAct } from "@/utils/ai/choose-rule/execute";
import prisma from "@/utils/prisma";
import { createScopedLogger } from "@/utils/logger";
import type { MatchReason } from "@/utils/ai/choose-rule/types";
import { sanitizeActionFields } from "@/utils/action-item";
import { extractEmailAddress } from "@/utils/email";
import { analyzeSenderPattern } from "@/app/api/ai/analyze-sender-pattern/call-analyze-pattern-api";

const logger = createScopedLogger("ai-run-rules");

export type RunRulesResult = {
  rule?: Rule | null;
  actionItems?: ActionItem[];
  reason?: string | null;
  matchReasons?: MatchReason[];
  existing?: boolean;
};

export async function runRules({
  gmail,
  message,
  rules,
  emailAccount,
  isTest,
}: {
  gmail: gmail_v1.Gmail;
  message: ParsedMessage;
  rules: RuleWithActionsAndCategories[];
  emailAccount: EmailAccountWithAI;
  isTest: boolean;
}): Promise<RunRulesResult> {
  const result = await findMatchingRule({
    rules,
    message,
    emailAccount,
    gmail,
  });

  analyzeSenderPatternIfAiMatch({
    isTest,
    result,
    message,
    emailAccountId: emailAccount.id,
  });

  logger.trace("Matching rule", { result });

  if (result.rule) {
    return await executeMatchedRule(
      result.rule,
      message,
      emailAccount,
      gmail,
      result.reason,
      result.matchReasons,
      isTest,
    );
  } else {
    await saveSkippedExecutedRule({
      emailAccountId: emailAccount.id,
      threadId: message.threadId,
      messageId: message.id,
      reason: result.reason,
    });
  }
  return result;
}

async function executeMatchedRule(
  rule: RuleWithActionsAndCategories,
  message: ParsedMessage,
  emailAccount: EmailAccountWithAI,
  gmail: gmail_v1.Gmail,
  reason: string | undefined,
  matchReasons: MatchReason[] | undefined,
  isTest: boolean,
) {
  // get action items with args
  const actionItems = await getActionItemsWithAiArgs({
    message,
    emailAccount,
    selectedRule: rule,
    gmail,
  });

  // handle action
  const executedRule = isTest
    ? undefined
    : await saveExecutedRule(
        {
          emailAccountId: emailAccount.id,
          threadId: message.threadId,
          messageId: message.id,
        },
        {
          rule,
          actionItems,
          reason,
        },
      );

  const shouldExecute = executedRule && rule.automate;

  if (shouldExecute) {
    await executeAct({
      gmail,
      userEmail: emailAccount.email,
      userId: emailAccount.userId,
      emailAccountId: emailAccount.id,
      executedRule,
      message,
    });
  }

  return {
    rule,
    actionItems,
    executedRule,
    reason,
    matchReasons,
  };
}

async function saveSkippedExecutedRule({
  emailAccountId,
  threadId,
  messageId,
  reason,
}: {
  emailAccountId: string;
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
    emailAccount: { connect: { id: emailAccountId } },
  };

  await upsertExecutedRule({
    emailAccountId,
    threadId,
    messageId,
    data,
  });
}

async function saveExecutedRule(
  {
    emailAccountId,
    threadId,
    messageId,
  }: {
    emailAccountId: string;
    threadId: string;
    messageId: string;
  },
  {
    rule,
    actionItems,
    reason,
  }: {
    rule: RuleWithActionsAndCategories;
    actionItems: ActionItem[];
    reason?: string;
  },
) {
  const now = new Date();

  // Process action items and calculate scheduled times
  const processedActionItems =
    actionItems?.map((item) => {
      const sanitized = sanitizeActionFields(item);

      // Calculate scheduledAt time if delayMs is specified
      const scheduledAt =
        item.delayMs && item.delayMs > 0
          ? new Date(now.getTime() + item.delayMs)
          : now;

      const status =
        item.delayMs && item.delayMs > 0
          ? ("SCHEDULED" as const)
          : ("PENDING" as const);

      return {
        ...sanitized,
        scheduledAt,
        status,
      };
    }) || [];

  const data: Prisma.ExecutedRuleCreateInput = {
    actionItems: {
      create: processedActionItems,
    },
    messageId,
    threadId,
    automated: !!rule?.automate,
    status: ExecutedRuleStatus.PENDING,
    reason,
    rule: rule?.id ? { connect: { id: rule.id } } : undefined,
    emailAccount: { connect: { id: emailAccountId } },
  };

  return await upsertExecutedRule({
    emailAccountId,
    threadId,
    messageId,
    data,
  });
}

async function upsertExecutedRule({
  emailAccountId,
  threadId,
  messageId,
  data,
}: {
  emailAccountId: string;
  threadId: string;
  messageId: string;
  data: Prisma.ExecutedRuleCreateInput;
}) {
  try {
    return await prisma.executedRule.upsert({
      where: {
        unique_emailAccount_thread_message: {
          emailAccountId,
          threadId,
          messageId,
        },
      },
      create: data,
      update: data,
      include: { actionItems: true },
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      // Unique constraint violation, ignore the error
      // May be due to a race condition?
      logger.info("Ignored duplicate entry for ExecutedRule", {
        emailAccountId,
        threadId,
        messageId,
      });
      return await prisma.executedRule.findUnique({
        where: {
          unique_emailAccount_thread_message: {
            emailAccountId,
            threadId,
            messageId,
          },
        },
        include: { actionItems: true },
      });
    }
    // Re-throw any other errors
    throw error;
  }
}

function analyzeSenderPatternIfAiMatch({
  isTest,
  result,
  message,
  emailAccountId,
}: {
  isTest: boolean;
  result: { reason?: string };
  message: ParsedMessage;
  emailAccountId: string;
}) {
  if (isTest) return;

  const isAiMatch = result.reason?.toLowerCase().includes("ai");
  if (!isAiMatch) return;

  const email = extractEmailAddress(message.headers.from);
  if (!email) return;

  after(() =>
    analyzeSenderPattern({
      emailAccountId,
      from: email,
    }),
  );
}
