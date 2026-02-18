import { z } from "zod";
import { withError } from "@/utils/middleware";
import { withQstashOrInternal } from "@/utils/qstash";
import prisma from "@/utils/prisma";
import {
  AutomationJobRunStatus,
  MessagingProvider,
} from "@/generated/prisma/enums";
import { createEmailProvider } from "@/utils/email/provider";
import { getAutomationJobMessage } from "@/utils/automation-jobs/message";
import { sendAutomationMessageToSlack } from "@/utils/automation-jobs/slack";

export const maxDuration = 300;

const executeAutomationJobBody = z.object({
  automationJobRunId: z.string().min(1, "Automation job run ID is required"),
});

export const POST = withError(
  "automation-jobs/execute",
  withQstashOrInternal(async (request) => {
    const logger = request.logger;

    const rawPayload = await request.json();
    const validation = executeAutomationJobBody.safeParse(rawPayload);

    if (!validation.success) {
      logger.error("Invalid automation job execute payload", {
        errors: validation.error.errors,
      });
      return new Response("Invalid payload", { status: 400 });
    }

    const { automationJobRunId } = validation.data;

    const run = await prisma.automationJobRun.findUnique({
      where: { id: automationJobRunId },
      include: {
        automationJob: {
          include: {
            messagingChannel: {
              include: {
                emailAccount: {
                  include: {
                    account: {
                      select: {
                        provider: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!run) {
      logger.warn("Automation job run not found", { automationJobRunId });
      return new Response("Automation job run not found", { status: 404 });
    }

    if (run.status !== AutomationJobRunStatus.PENDING) {
      logger.info("Automation job run already processed", {
        automationJobRunId,
        status: run.status,
      });
      return new Response("Run already processed", { status: 200 });
    }

    const claimed = await prisma.automationJobRun.updateMany({
      where: {
        id: automationJobRunId,
        status: AutomationJobRunStatus.PENDING,
      },
      data: {
        status: AutomationJobRunStatus.RUNNING,
      },
    });

    if (claimed.count === 0) {
      logger.info("Automation job run was claimed by another worker", {
        automationJobRunId,
      });
      return new Response("Run already claimed", { status: 200 });
    }

    const runLogger = logger.with({
      automationJobRunId,
      automationJobId: run.automationJobId,
      emailAccountId: run.automationJob.emailAccountId,
    });

    try {
      if (!run.automationJob.enabled) {
        await prisma.automationJobRun.update({
          where: { id: automationJobRunId },
          data: {
            status: AutomationJobRunStatus.SKIPPED,
            processedAt: new Date(),
            error: "Automation job is disabled",
          },
        });

        return new Response("Automation job disabled", { status: 200 });
      }

      if (!run.automationJob.messagingChannel.isConnected) {
        await prisma.automationJobRun.update({
          where: { id: automationJobRunId },
          data: {
            status: AutomationJobRunStatus.SKIPPED,
            processedAt: new Date(),
            error: "Messaging channel is disconnected",
          },
        });

        return new Response("Messaging channel disconnected", { status: 200 });
      }

      if (
        run.automationJob.messagingChannel.provider !== MessagingProvider.SLACK
      ) {
        throw new Error("Unsupported messaging provider for automation job");
      }

      const provider =
        run.automationJob.messagingChannel.emailAccount.account.provider;
      if (!provider) {
        throw new Error("Email provider is not connected");
      }

      const emailProvider = await createEmailProvider({
        emailAccountId: run.automationJob.emailAccountId,
        provider,
        logger: runLogger,
      });

      const outboundMessage = await getAutomationJobMessage({
        jobType: run.automationJob.jobType,
        prompt: run.automationJob.prompt,
        emailProvider,
        logger: runLogger,
      });

      const slackResult = await sendAutomationMessageToSlack({
        channel: run.automationJob.messagingChannel,
        text: outboundMessage,
        logger: runLogger,
      });

      await prisma.automationJobRun.update({
        where: { id: automationJobRunId },
        data: {
          status: AutomationJobRunStatus.SENT,
          processedAt: new Date(),
          outboundMessage,
          slackMessageTs: slackResult.messageTs,
          error: null,
        },
      });

      return new Response("Automation job executed", { status: 200 });
    } catch (error) {
      const errorMessage =
        error instanceof Error
          ? error.message
          : "Failed to execute automation job";

      runLogger.error("Automation job execution failed", { error });

      await prisma.automationJobRun.update({
        where: { id: automationJobRunId },
        data: {
          status: AutomationJobRunStatus.FAILED,
          processedAt: new Date(),
          error: errorMessage,
        },
      });

      return new Response("Automation job execution failed", { status: 500 });
    }
  }),
);
