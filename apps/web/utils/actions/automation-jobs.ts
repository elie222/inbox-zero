"use server";

import { actionClient } from "@/utils/actions/safe-action";
import {
  saveAutomationJobBody,
  toggleAutomationJobBody,
} from "@/utils/actions/automation-jobs.validation";
import { SafeError } from "@/utils/error";
import { MessagingProvider } from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import {
  getNextAutomationJobRunAt,
  validateAutomationCronExpression,
} from "@/utils/automation-jobs/cron";
import {
  AUTOMATION_JOB_TYPES,
  DEFAULT_AUTOMATION_JOB_CRON,
  getDefaultAutomationJobName,
} from "@/utils/automation-jobs/defaults";

export const toggleAutomationJobAction = actionClient
  .metadata({ name: "toggleAutomationJob" })
  .inputSchema(toggleAutomationJobBody)
  .action(async ({ ctx: { emailAccountId }, parsedInput: { enabled } }) => {
    const existingJob = await prisma.automationJob.findFirst({
      where: { emailAccountId },
      orderBy: { createdAt: "asc" },
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
        name: getDefaultAutomationJobName(AUTOMATION_JOB_TYPES.INBOX_NUDGE),
        enabled: true,
        jobType: AUTOMATION_JOB_TYPES.INBOX_NUDGE,
        cronExpression: DEFAULT_AUTOMATION_JOB_CRON,
        nextRunAt,
        messagingChannelId: defaultChannel.id,
        emailAccountId,
      },
    });
  });

export const saveAutomationJobAction = actionClient
  .metadata({ name: "saveAutomationJob" })
  .inputSchema(saveAutomationJobBody)
  .action(
    async ({
      ctx: { emailAccountId },
      parsedInput: { cronExpression, jobType, messagingChannelId, prompt },
    }) => {
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

      const existingJob = await prisma.automationJob.findFirst({
        where: { emailAccountId },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });

      const nextRunAt = getNextAutomationJobRunAt({
        cronExpression,
        fromDate: new Date(),
      });

      const normalizedPrompt = prompt?.trim() || null;
      const name = getDefaultAutomationJobName(jobType);

      if (existingJob) {
        await prisma.automationJob.update({
          where: { id: existingJob.id },
          data: {
            enabled: true,
            name,
            cronExpression,
            jobType,
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
          jobType,
          prompt: normalizedPrompt,
          nextRunAt,
          messagingChannelId,
          emailAccountId,
        },
      });
    },
  );

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
