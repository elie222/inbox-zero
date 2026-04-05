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
  MessagingRoutePurpose,
} from "@/generated/prisma/enums";
import prisma from "@/utils/prisma";
import { hasMessagingRoute } from "@/utils/messaging/routes";
import {
  getNextAutomationJobRunAt,
  validateAutomationCronExpression,
} from "@/utils/automation-jobs/cron";
import {
  DEFAULT_AUTOMATION_JOB_CRON,
  getDefaultAutomationJobName,
} from "@/utils/automation-jobs/defaults";
import {
  assertCanEnableAutomationJobs,
  createAutomationJob,
} from "@/utils/actions/automation-jobs.helpers";
import { enqueueBackgroundJob } from "@/utils/queue/dispatch";
import {
  isAutomationMessagingChannelReady,
  isSupportedAutomationMessagingProvider,
  SUPPORTED_AUTOMATION_MESSAGING_PROVIDERS,
} from "@/utils/automation-jobs/messaging-channel";

const AUTOMATION_JOBS_TOPIC = "automation-jobs-execute";

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
      await createAutomationJob({
        emailAccountId,
        cronExpression: DEFAULT_AUTOMATION_JOB_CRON,
        messagingChannelId: defaultChannel.id,
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
          routes: {
            select: {
              purpose: true,
              targetId: true,
            },
          },
        },
      });

      if (!channel) {
        throw new SafeError("Messaging channel not found");
      }

      if (!isSupportedAutomationMessagingProvider(channel.provider)) {
        throw new SafeError("Messaging provider is not supported");
      }

      const validationError =
        getAutomationMessagingChannelValidationError(channel);
      if (validationError) {
        throw new SafeError(validationError);
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

      await createAutomationJob({
        emailAccountId,
        cronExpression,
        prompt: normalizedPrompt,
        messagingChannelId,
      });
    },
  );

export const triggerTestCheckInAction = actionClient
  .metadata({ name: "triggerTestCheckIn" })
  .inputSchema(triggerTestCheckInBody)
  .action(async ({ ctx: { emailAccountId, userId, logger } }) => {
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
            routes: {
              select: {
                purpose: true,
                targetId: true,
              },
            },
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
    const validationError =
      getAutomationMessagingChannelValidationError(channel);
    if (validationError) {
      throw new SafeError(validationError);
    }

    const run = await prisma.automationJobRun.create({
      data: {
        automationJobId: job.id,
        status: AutomationJobRunStatus.PENDING,
        scheduledFor: new Date(),
      },
      select: { id: true },
    });

    await enqueueBackgroundJob({
      topic: AUTOMATION_JOBS_TOPIC,
      body: { automationJobRunId: run.id },
      qstash: {
        queueName: "automation-jobs",
        parallelism: 3,
        path: "/api/automation-jobs/execute",
      },
      logger,
    });
  });

async function getDefaultMessagingChannel(emailAccountId: string) {
  const channels = await prisma.messagingChannel.findMany({
    where: {
      emailAccountId,
      isConnected: true,
      provider: {
        in: SUPPORTED_AUTOMATION_MESSAGING_PROVIDERS,
      },
    },
    select: {
      id: true,
      provider: true,
      isConnected: true,
      accessToken: true,
      routes: {
        select: {
          purpose: true,
          targetId: true,
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const channel = channels.find((candidate) =>
    isAutomationMessagingChannelReady(candidate),
  );

  if (!channel) {
    throw new SafeError(
      "Connect a supported messaging channel before enabling proactive updates",
    );
  }

  return channel;
}

function getAutomationMessagingChannelValidationError(channel: {
  provider: MessagingProvider;
  isConnected: boolean;
  accessToken: string | null;
  routes: Array<{
    purpose: MessagingRoutePurpose;
    targetId: string;
  }>;
}) {
  if (!isSupportedAutomationMessagingProvider(channel.provider)) {
    return "Messaging provider is not supported";
  }

  if (!channel.isConnected) return "Messaging channel is not connected";

  if (channel.provider === MessagingProvider.SLACK && !channel.accessToken) {
    return "Slack channel is not connected";
  }

  if (
    !hasMessagingRoute(channel.routes, MessagingRoutePurpose.RULE_NOTIFICATIONS)
  ) {
    return "Select a messaging destination first";
  }

  if (!isAutomationMessagingChannelReady(channel)) {
    return "Messaging channel is not connected";
  }

  return null;
}
