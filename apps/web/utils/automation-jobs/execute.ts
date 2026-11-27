import { z } from "zod";
import {
  AutomationJobRunStatus,
  MessagingRoutePurpose,
} from "@/generated/prisma/enums";
import { AutomationJobConfigurationError } from "@/utils/automation-jobs/slack";
import { isStaleAutomationJobRun } from "@/utils/automation-jobs/stale";
import { createEmailProvider } from "@/utils/email/provider";
import { SafeError } from "@/utils/error";
import { getAutomationJobMessage } from "@/utils/automation-jobs/message";
import type { Logger } from "@/utils/logger";
import { isActivePremium } from "@/utils/premium";
import prisma from "@/utils/prisma";
import { getUserPremium } from "@/utils/user/get";
import { sendAutomationMessage } from "@/utils/automation-jobs/messaging";
import { getMessagingRoute } from "@/utils/messaging/routes";
import { sleep } from "@/utils/sleep";

const MAX_RUN_ATTEMPTS = 3;

export const executeAutomationJobBody = z.object({
  automationJobRunId: z.string().min(1, "Automation job run ID is required"),
});

export async function executeAutomationJobRun({
  automationJobRunId,
  logger,
  retryInRequest = false,
}: {
  automationJobRunId: string;
  logger: Logger;
  retryInRequest?: boolean;
}) {
  for (let attempt = 1; ; attempt++) {
    const response = await attemptAutomationJobRun({
      automationJobRunId,
      logger,
    });
    if (
      !retryInRequest ||
      response.status !== 503 ||
      attempt >= MAX_RUN_ATTEMPTS
    ) {
      return response;
    }
    await sleep(1000 * attempt);
  }
}

async function attemptAutomationJobRun({
  automationJobRunId,
  logger,
}: {
  automationJobRunId: string;
  logger: Logger;
}) {
  const run = await prisma.automationJobRun.findUnique({
    where: { id: automationJobRunId },
    include: {
      automationJob: {
        include: {
          messagingChannel: {
            include: {
              routes: {
                select: {
                  purpose: true,
                  targetType: true,
                  targetId: true,
                },
              },
              emailAccount: {
                select: {
                  id: true,
                  userId: true,
                  email: true,
                  name: true,
                  about: true,
                  account: {
                    select: {
                      provider: true,
                    },
                  },
                  user: {
                    select: {
                      aiProvider: true,
                      aiModel: true,
                      aiApiKey: true,
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

  const runLogger = logger.with({
    automationJobRunId,
    automationJobId: run.automationJobId,
    emailAccountId: run.automationJob.emailAccountId,
  });

  if (run.status === AutomationJobRunStatus.RUNNING) {
    runLogger.info("Automation job run is already RUNNING", {
      createdAt: run.createdAt,
    });
    return new Response("Run currently running", { status: 409 });
  }
  if (run.status !== AutomationJobRunStatus.PENDING) {
    runLogger.info("Automation job run already processed", {
      status: run.status,
    });
    return new Response("Run already processed", { status: 200 });
  }

  if (isStaleAutomationJobRun({ scheduledFor: run.scheduledFor })) {
    const skipped = await prisma.automationJobRun.updateMany({
      where: {
        id: automationJobRunId,
        status: AutomationJobRunStatus.PENDING,
      },
      data: {
        status: AutomationJobRunStatus.SKIPPED,
        processedAt: new Date(),
        error: "Skipped stale automation job run",
      },
    });

    if (skipped.count === 0) {
      runLogger.info("Stale automation job run already claimed");
      return new Response("Run already claimed", { status: 409 });
    }

    runLogger.info("Skipped stale automation job run", {
      scheduledFor: run.scheduledFor,
      createdAt: run.createdAt,
    });
    return new Response("Run skipped because stale", { status: 200 });
  }

  const claimed = await prisma.automationJobRun.updateMany({
    where: {
      id: automationJobRunId,
      status: AutomationJobRunStatus.PENDING,
      attempts: run.attempts,
    },
    data: {
      status: AutomationJobRunStatus.RUNNING,
      attempts: { increment: 1 },
    },
  });

  if (claimed.count === 0) {
    runLogger.info("Automation job run was claimed by another worker");
    return new Response("Run already claimed", { status: 409 });
  }

  let deliveryStarted = false;
  try {
    if (!run.automationJob.enabled) {
      runLogger.info("Skipping automation job run because job is disabled");
      await markAutomationJobRunSkipped({
        automationJobRunId,
        error: "Automation job is disabled",
      });

      return new Response("Automation job disabled", { status: 200 });
    }

    const premium = await getUserPremium({
      userId: run.automationJob.messagingChannel.emailAccount.userId,
    });
    if (!isActivePremium(premium)) {
      runLogger.info(
        "Skipping automation job run because owner is not premium",
      );
      await markAutomationJobRunSkipped({
        automationJobRunId,
        error: "Owner no longer has active premium",
      });

      return new Response("Owner no longer has active premium", {
        status: 200,
      });
    }

    if (!run.automationJob.messagingChannel.isConnected) {
      runLogger.info(
        "Skipping automation job run because messaging channel is disconnected",
      );
      await markAutomationJobRunSkipped({
        automationJobRunId,
        error: "Messaging channel is disconnected",
      });

      return new Response("Messaging channel disconnected", { status: 200 });
    }

    const route = getMessagingRoute(
      run.automationJob.messagingChannel.routes,
      MessagingRoutePurpose.SCHEDULED_CHECK_INS,
    );
    if (!route) {
      throw new AutomationJobConfigurationError(
        "Scheduled check-in destination is not configured",
      );
    }

    const provider =
      run.automationJob.messagingChannel.emailAccount.account.provider;
    if (!provider) {
      throw new AutomationJobConfigurationError(
        "Email provider is not connected",
      );
    }

    const emailProvider = await createEmailProvider({
      emailAccountId: run.automationJob.emailAccountId,
      provider,
      logger: runLogger,
    }).catch((error) => {
      if (error instanceof SafeError && error.message === "No refresh token") {
        throw new AutomationJobConfigurationError(
          "Email account needs to be reconnected",
        );
      }
      throw error;
    });

    const outboundMessage = await getAutomationJobMessage({
      prompt: run.automationJob.prompt,
      emailProvider,
      emailAccount: run.automationJob.messagingChannel.emailAccount,
      logger: runLogger,
    });

    deliveryStarted = true;
    const messagingResult = await sendAutomationMessage({
      channel: run.automationJob.messagingChannel,
      route,
      text: outboundMessage,
      logger: runLogger,
    });

    await prisma.automationJobRun.update({
      where: { id: automationJobRunId },
      data: {
        status: AutomationJobRunStatus.SENT,
        processedAt: new Date(),
        outboundMessage,
        providerMessageId: messagingResult.messageId,
        error: null,
      },
    });

    return new Response("Automation job executed", { status: 200 });
  } catch (error) {
    const errorMessage =
      error instanceof Error
        ? error.message
        : "Failed to execute automation job";
    const isConfigurationError =
      error instanceof AutomationJobConfigurationError;

    if (isConfigurationError) {
      runLogger.warn("Skipped automation job run due to configuration", {
        error,
      });
    } else {
      runLogger.error("Automation job execution failed", { error });
    }

    // Once delivery starts, the provider may have accepted the message.
    const retryable =
      !isConfigurationError &&
      !deliveryStarted &&
      run.attempts + 1 < MAX_RUN_ATTEMPTS;
    await prisma.automationJobRun.update({
      where: { id: automationJobRunId },
      data: {
        status: isConfigurationError
          ? AutomationJobRunStatus.SKIPPED
          : retryable
            ? AutomationJobRunStatus.PENDING
            : AutomationJobRunStatus.FAILED,
        processedAt: retryable ? null : new Date(),
        error: errorMessage,
      },
    });

    if (isConfigurationError) {
      return new Response("Automation job skipped due to configuration", {
        status: 200,
      });
    }
    if (retryable) {
      return new Response(
        "Automation job failed before delivery and can retry",
        {
          status: 503,
        },
      );
    }
    return new Response("Automation job execution failed", { status: 500 });
  }
}

async function markAutomationJobRunSkipped({
  automationJobRunId,
  error,
}: {
  automationJobRunId: string;
  error: string;
}) {
  await prisma.automationJobRun.update({
    where: { id: automationJobRunId },
    data: {
      status: AutomationJobRunStatus.SKIPPED,
      processedAt: new Date(),
      error,
    },
  });
}
