import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import { isActivePremium } from "@/utils/premium";
import { getUserPremium } from "@/utils/user/get";
import { getNextAutomationJobRunAt } from "@/utils/automation-jobs/cron";
import { getDefaultAutomationJobName } from "@/utils/automation-jobs/defaults";

export async function canEnableAutomationJobs(userId: string) {
  const premium = await getUserPremium({ userId });
  return isActivePremium(premium);
}

export async function assertCanEnableAutomationJobs(userId: string) {
  if (!(await canEnableAutomationJobs(userId))) {
    throw new SafeError("Premium is required for scheduled check-ins");
  }
}

export async function createAutomationJob({
  emailAccountId,
  cronExpression,
  messagingChannelId,
  prompt,
}: {
  emailAccountId: string;
  cronExpression: string;
  messagingChannelId: string;
  prompt?: string | null;
}) {
  const nextRunAt = getNextAutomationJobRunAt({
    cronExpression,
    fromDate: new Date(),
  });

  return prisma.automationJob.create({
    data: {
      enabled: true,
      name: getDefaultAutomationJobName(),
      cronExpression,
      prompt: prompt ?? null,
      nextRunAt,
      messagingChannelId,
      emailAccountId,
    },
  });
}
