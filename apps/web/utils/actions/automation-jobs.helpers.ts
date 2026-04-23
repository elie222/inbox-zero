import { SafeError } from "@/utils/error";
import prisma from "@/utils/prisma";
import { isActivePremium } from "@/utils/premium";
import { getUserPremium } from "@/utils/user/get";
import { getNextAutomationJobRunAt } from "@/utils/automation-jobs/cron";
import { getDefaultAutomationJobName } from "@/utils/automation-jobs/defaults";
import { ensureScheduledCheckInsRoute } from "@/utils/automation-jobs/destination";
import { isMessagingChannelOperational } from "@/utils/messaging/channel-validity";
import { isSupportedAutomationMessagingProvider } from "@/utils/automation-jobs/messaging-channel";

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
  const channel = await prisma.messagingChannel.findUnique({
    where: {
      id_emailAccountId: {
        id: messagingChannelId,
        emailAccountId,
      },
    },
    select: {
      id: true,
      provider: true,
      isConnected: true,
      accessToken: true,
      providerUserId: true,
      teamId: true,
      routes: {
        select: {
          purpose: true,
          targetType: true,
          targetId: true,
        },
      },
    },
  });

  if (!channel) throw new SafeError("Messaging channel not found");
  if (!isSupportedAutomationMessagingProvider(channel.provider)) {
    throw new SafeError("Messaging provider is not supported");
  }
  if (!isMessagingChannelOperational(channel)) {
    throw new SafeError("Messaging channel is not connected");
  }

  const route = await ensureScheduledCheckInsRoute({
    channel,
    routes: channel.routes,
  });
  if (!route) {
    throw new SafeError("Select a messaging destination first");
  }

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
