import type { gmail_v1 } from "@googleapis/gmail";
import type { UserAIFields } from "@/utils/llms/types";
import prisma from "@/utils/prisma";
import type { Rule, User } from "@prisma/client";
import { ExecutedRuleStatus, Prisma } from "@prisma/client";
import {
  type ChooseRuleOptions,
  chooseRule,
} from "@/utils/ai/choose-rule/choose";
import { executeAct } from "@/utils/ai/choose-rule/execute";
import type { EmailForLLM } from "@/utils/ai/choose-rule/stringify-email";
import type { ActionItem, EmailForAction } from "@/utils/ai/actions";

type ChooseRuleAndExecuteOptions = ChooseRuleOptions & {
  email: EmailForLLM & EmailForAction;
  user: Pick<User, "id" | "email" | "about"> & UserAIFields;
  gmail: gmail_v1.Gmail;
  isTest: boolean;
};

/**
 * Choose a rule to apply to an email.
 * If enabled, execute it.
 */
export async function chooseRuleAndExecute(
  options: ChooseRuleAndExecuteOptions,
): Promise<{
  handled: boolean;
  rule?: Rule;
  actionItems?: ActionItem[];
  reason?: string;
}> {
  const { rules, email, user, gmail, isTest } = options;

  if (!rules.length) return { handled: false };

  const plannedAct = await chooseRule(options);

  console.log(
    `Planned act: ${plannedAct.rule?.name} ${plannedAct.actionItems}`,
  );

  // no rule to apply to this thread
  if (!plannedAct.rule) return { handled: false, reason: plannedAct.reason };

  const executedRule = isTest
    ? undefined
    : await saveExecutedRule(
        {
          userId: user.id,
          threadId: email.threadId,
          messageId: email.messageId,
        },
        plannedAct,
      );

  const shouldExecute = !!(executedRule && plannedAct.rule?.automate);

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
    rule: plannedAct.rule,
    actionItems: plannedAct.actionItems,
  };
}

export async function saveExecutedRule(
  {
    userId,
    threadId,
    messageId,
  }: {
    userId: string;
    threadId: string;
    messageId: string;
  },
  plannedAct: Awaited<ReturnType<typeof chooseRule>>,
) {
  const data: Prisma.ExecutedRuleCreateInput = {
    actionItems: { createMany: { data: plannedAct.actionItems || [] } },
    messageId,
    threadId,
    automated: !!plannedAct.rule?.automate,
    status: ExecutedRuleStatus.PENDING,
    reason: plannedAct.reason,
    rule: plannedAct.rule?.id
      ? { connect: { id: plannedAct.rule.id } }
      : undefined,
    user: { connect: { id: userId } },
  };

  return await upsertExecutedRule({ userId, threadId, messageId, data });
}

export async function upsertExecutedRule({
  userId,
  threadId,
  messageId,
  data,
}: {
  userId: string;
  threadId: string;
  messageId: string;
  data: Prisma.ExecutedRuleCreateInput;
}) {
  try {
    return await prisma.executedRule.upsert({
      where: {
        unique_user_thread_message: {
          userId,
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
      console.log(
        `Ignored duplicate entry for ExecutedRule: ${userId} ${threadId} ${messageId}`,
      );
      return await prisma.executedRule.findUnique({
        where: {
          unique_user_thread_message: {
            userId,
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
