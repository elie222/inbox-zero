import type { gmail_v1 } from "googleapis";
import type { UserAIFields } from "@/utils/llms/types";
import prisma from "@/utils/prisma";
import type { Rule, User } from "@prisma/client";
import { ExecutedRuleStatus } from "@prisma/client";
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
  forceExecute?: boolean;
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
  const { rules, email, user, forceExecute, gmail, isTest } = options;

  if (!rules.length) return { handled: false };

  const plannedAct = await chooseRule(options);

  console.log("Planned act:", plannedAct.rule?.name, plannedAct.actionItems);

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

  const shouldExecute =
    executedRule && (plannedAct.rule?.automate || forceExecute);

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
  const data = {
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

  const executedRule = await prisma.executedRule.upsert({
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

  return executedRule;
}
