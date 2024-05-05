import { type gmail_v1 } from "googleapis";
import { UserAIFields } from "@/utils/llms/types";
import prisma from "@/utils/prisma";
import { User } from "@prisma/client";
import { ExecutedRuleStatus } from "@prisma/client";
import { ChooseRuleOptions, chooseRule } from "@/utils/ai/choose-rule/choose";
import { executeAct } from "@/utils/ai/choose-rule/execute";
import { EmailForLLM } from "@/utils/ai/choose-rule/stringify-email";
import { EmailForAction } from "@/utils/ai/actions";

type ChooseRuleAndExecuteOptions = ChooseRuleOptions & {
  email: EmailForLLM & EmailForAction;
  user: Pick<User, "id" | "email" | "about"> & UserAIFields;
  gmail: gmail_v1.Gmail;
  forceExecute?: boolean;
};

/**
 * Choose a rule to apply to an email.
 * If enabled, execute it.
 */
export async function chooseRuleAndExecute(
  options: ChooseRuleAndExecuteOptions,
): Promise<{ handled: boolean; reason?: string }> {
  const { rules, email, user, forceExecute, gmail } = options;

  if (!rules.length) return { handled: false };

  const plannedAct = await chooseRule(options);

  console.log("Planned act:", plannedAct.rule?.name, plannedAct.actionItems);

  // no rule to apply to this thread
  if (!plannedAct.rule) return { handled: false, reason: plannedAct.reason };

  const executedRule = await saveExecutedRule(
    {
      userId: user.id,
      threadId: email.threadId,
      messageId: email.messageId,
    },
    plannedAct,
  );

  const shouldExecute = plannedAct.rule?.automate || forceExecute;

  if (shouldExecute) {
    await executeAct({
      gmail,
      userEmail: user.email || "",
      executedRule,
      email,
    });
  }

  return { handled: true };
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
