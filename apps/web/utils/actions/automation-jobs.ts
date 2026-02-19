"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  saveAutomationJobBody,
  toggleAutomationJobBody,
  triggerTestCheckInBody,
} from "@/utils/actions/automation-jobs.validation";
import { SafeError } from "@/utils/error";
import {
  AutomationJobRunStatus,
  MessagingProvider,
} from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import {
  getNextAutomationJobRunAt,
  validateAutomationCronExpression,
} from "@/utils/automation-jobs/cron";
import {
  DEFAULT_AUTOMATION_JOB_CRON,
  getDefaultAutomationJobName,
} from "@/utils/automation-jobs/defaults";
import { isActivePremium } from "@/utils/premium";
import { getUserPremium } from "@/utils/user/get";
import { publishToQstashQueue } from "@/utils/upstash";

export const toggleAutomationJobAction = actionClient
  .metadata({ name: "toggleAutomationJob" })
  .inputSchema(toggleAutomationJobBody)
  .action(
    async ({ ctx: { emailAccountId, userId }, parsedInput: { enabled } }) => {
      if (enabled) {
        await assertCanEnableAutomationJobs(userId);
      }

      const existingJob = await prisma.automationJob.findUnique({
        where: { emailAccountId },
      });

      if (!enabled) {
        if (existingJob) {
          await prisma.automationJob.update({
            where: { id: existingJob.id },
            data: { enabled: false },
          });
        }

        return;
      }

      if (existingJob) {
        await prisma.automationJob.update({
          where: { id: existingJob.id },
          data: {
            enabled: true,
            nextRunAt: getNextAutomationJobRunAt({
              cronExpression: existingJob.cronExpression,
              fromDate: new Date(),
            }),
          },
        });
        return;
      }

      const defaultChannel = await getDefaultMessagingChannel(emailAccountId);
      const nextRunAt = getNextAutomationJobRunAt({
        cronExpression: DEFAULT_AUTOMATION_JOB_CRON,
        fromDate: new Date(),
      });

      await prisma.automationJob.create({
        data: {
          name: getDefaultAutomationJobName(),
          enabled: true,
          cronExpression: DEFAULT_AUTOMATION_JOB_CRON,
          nextRunAt,
          messagingChannelId: defaultChannel.id,
          emailAccountId,
        },
      });
    },
  );

export const saveAutomationJobAction = actionClient
  .metadata({ name: "saveAutomationJob" })
  .inputSchema(saveAutomationJobBody)
  .action(
    async ({
      ctx: { emailAccountId, userId },
      parsedInput: { cronExpression, messagingChannelId, prompt },
    }) => {
      await assertCanEnableAutomationJobs(userId);

      try {
        validateAutomationCronExpression(cronExpression);
      } catch {
        throw new SafeError("Invalid schedule");
      }

      const channel = await prisma.messagingChannel.findUnique({
        where: { id: messagingChannelId },
        select: {
          id: true,
          emailAccountId: true,
          provider: true,
          isConnected: true,
          accessToken: true,
          providerUserId: true,
          channelId: true,
        },
      });

      if (!channel || channel.emailAccountId !== emailAccountId) {
        throw new SafeError("Messaging channel not found");
      }

      if (channel.provider !== MessagingProvider.SLACK) {
        throw new SafeError("Only Slack is supported");
      }

      if (!channel.isConnected || !channel.accessToken) {
        throw new SafeError("Slack channel is not connected");
      }

      if (!channel.providerUserId && !channel.channelId) {
        throw new SafeError("Select a Slack destination first");
      }

      const existingJob = await prisma.automationJob.findUnique({
        where: { emailAccountId },
        select: { id: true },
      });

      const nextRunAt = getNextAutomationJobRunAt({
        cronExpression,
        fromDate: new Date(),
      });

      const normalizedPrompt = prompt?.trim() || null;
      const name = getDefaultAutomationJobName();

      if (existingJob) {
        await prisma.automationJob.update({
          where: { id: existingJob.id },
          data: {
            enabled: true,
            name,
            cronExpression,
            prompt: normalizedPrompt,
            nextRunAt,
            messagingChannelId,
          },
        });
        return;
      }

      await prisma.automationJob.create({
        data: {
          enabled: true,
          name,
          cronExpression,
          prompt: normalizedPrompt,
          nextRunAt,
          messagingChannelId,
          emailAccountId,
        },
      });
    },
  );

export const triggerTestCheckInAction = actionClient
  .metadata({ name: "triggerTestCheckIn" })
  .inputSchema(triggerTestCheckInBody)
  .action(async ({ ctx: { emailAccountId, userId } }) => {
    await assertCanEnableAutomationJobs(userId);

    const job = await prisma.automationJob.findUnique({
      where: { emailAccountId },
      select: {
        id: true,
        enabled: true,
        messagingChannel: {
          select: {
            provider: true,
            isConnected: true,
            accessToken: true,
            providerUserId: true,
            channelId: true,
          },
        },
      },
    });

    if (!job) {
      throw new SafeError("No active check-in configured");
    }
    if (!job.enabled) {
      throw new SafeError("No active check-in configured");
    }

    const channel = job.messagingChannel;
    if (
      channel.provider !== MessagingProvider.SLACK ||
      !channel.isConnected ||
      !channel.accessToken ||
      (!channel.providerUserId && !channel.channelId)
    ) {
      throw new SafeError("Slack channel is not connected");
    }

    const run = await prisma.automationJobRun.create({
      data: {
        automationJobId: job.id,
        status: AutomationJobRunStatus.PENDING,
        scheduledFor: new Date(),
      },
      select: { id: true },
    });

    await publishToQstashQueue({
      queueName: "automation-jobs",
      parallelism: 3,
      path: "/api/automation-jobs/execute",
      body: { automationJobRunId: run.id },
    });
  });

async function getDefaultMessagingChannel(emailAccountId: string) {
  const channel = await prisma.messagingChannel.findFirst({
    where: {
      emailAccountId,
      provider: MessagingProvider.SLACK,
      isConnected: true,
      accessToken: { not: null },
      OR: [{ providerUserId: { not: null } }, { channelId: { not: null } }],
    },
    select: { id: true },
    orderBy: { updatedAt: "desc" },
  });

  if (!channel) {
    throw new SafeError("Connect Slack before enabling proactive updates");
  }

  return channel;
}

async function assertCanEnableAutomationJobs(userId: string) {
  const premium = await getUserPremium({ userId });

  if (!isActivePremium(premium)) {
    throw new SafeError("Premium is required for scheduled check-ins");
  }
}
