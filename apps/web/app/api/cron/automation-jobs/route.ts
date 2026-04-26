import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import { getNextAutomationJobRunAt } from "@/utils/automation-jobs/cron";
import { AutomationJobRunStatus } from "@/generated/prisma/enums";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { getPremiumUserFilter } from "@/utils/premium";
import { enqueueBackgroundJob } from "@/utils/queue/dispatch";
import {
  isAutomationMessagingChannelReady,
  SUPPORTED_AUTOMATION_MESSAGING_PROVIDERS,
} from "@/utils/automation-jobs/messaging-channel";

export const maxDuration = 300;

const BATCH_SIZE = 100;
const AUTOMATION_JOBS_TOPIC = "automation-jobs-execute";

export const GET = withError("cron/automation-jobs", async (request) => {
  if (!hasCronSecret(request)) {
    captureException(
      new Error("Unauthorized request: api/cron/automation-jobs"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await enqueueDueAutomationJobs(request.logger);
  return NextResponse.json(result);
});

export const POST = withError("cron/automation-jobs", async (request) => {
  if (!(await hasPostCronSecret(request))) {
    captureException(
      new Error("Unauthorized cron request: api/cron/automation-jobs"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await enqueueDueAutomationJobs(request.logger);
  return NextResponse.json(result);
});

async function enqueueDueAutomationJobs(logger: Logger) {
  const now = new Date();

  const dueJobs = await prisma.automationJob.findMany({
    where: {
      enabled: true,
      nextRunAt: { lte: now },
      messagingChannel: {
        isConnected: true,
        provider: { in: SUPPORTED_AUTOMATION_MESSAGING_PROVIDERS },
        emailAccount: {
          ...getPremiumUserFilter(),
        },
      },
    },
    select: {
      id: true,
      emailAccountId: true,
      nextRunAt: true,
      cronExpression: true,
      messagingChannel: {
        select: {
          provider: true,
          isConnected: true,
          accessToken: true,
          providerUserId: true,
          routes: {
            select: {
              purpose: true,
              targetId: true,
            },
          },
        },
      },
    },
    orderBy: { nextRunAt: "asc" },
    take: BATCH_SIZE,
  });

  logger.info("Found due automation jobs", { due: dueJobs.length });

  let claimed = 0;
  let queued = 0;
  let skipped = 0;
  let failed = 0;

  for (const job of dueJobs) {
    const jobLogger = logger.with({
      automationJobId: job.id,
      emailAccountId: job.emailAccountId,
    });

    let runId: string | null = null;

    try {
      if (!isAutomationMessagingChannelReady(job.messagingChannel)) {
        const nextRunAt = await deferAutomationJobUntilNextRun({
          automationJobId: job.id,
          scheduledFor: job.nextRunAt,
          cronExpression: job.cronExpression,
          now,
        });

        jobLogger.info(
          "Skipped automation job because messaging channel is not ready",
          {
            deferred: Boolean(nextRunAt),
            nextRunAt,
          },
        );
        skipped += 1;
        continue;
      }

      runId = await claimDueJobRun({
        automationJobId: job.id,
        scheduledFor: job.nextRunAt,
        cronExpression: job.cronExpression,
        now,
      });

      if (!runId) {
        jobLogger.info("Skipped automation job run claim");
        skipped += 1;
        continue;
      }

      claimed += 1;

      const dispatchMode = await enqueueBackgroundJob({
        topic: AUTOMATION_JOBS_TOPIC,
        body: { automationJobRunId: runId },
        qstash: {
          queueName: "automation-jobs",
          parallelism: 3,
          path: "/api/automation-jobs/execute",
        },
        logger: jobLogger,
      });

      jobLogger.info("Queued automation job run", {
        automationJobRunId: runId,
        dispatchMode,
      });

      queued += 1;
    } catch (error) {
      failed += 1;
      jobLogger.error("Failed to enqueue automation job run", { error, runId });

      if (runId) {
        await prisma.automationJobRun.update({
          where: { id: runId },
          data: {
            status: AutomationJobRunStatus.FAILED,
            processedAt: new Date(),
            error: "Failed to enqueue automation job run",
          },
        });
      }
    }
  }

  logger.info("Finished enqueueing due automation jobs", {
    due: dueJobs.length,
    claimed,
    queued,
    skipped,
    failed,
  });

  return {
    due: dueJobs.length,
    claimed,
    queued,
    skipped,
    failed,
  };
}

async function claimDueJobRun({
  automationJobId,
  scheduledFor,
  cronExpression,
  now,
}: {
  automationJobId: string;
  scheduledFor: Date;
  cronExpression: string;
  now: Date;
}) {
  try {
    return await prisma.$transaction(async (tx) => {
      const baselineFromDate = scheduledFor > now ? scheduledFor : now;
      const nextRunAt = getNextAutomationJobRunAt({
        cronExpression,
        fromDate: baselineFromDate,
      });

      const claim = await tx.automationJob.updateMany({
        where: {
          id: automationJobId,
          enabled: true,
          nextRunAt: scheduledFor,
        },
        data: { nextRunAt },
      });

      if (claim.count === 0) return null;

      const run = await tx.automationJobRun.create({
        data: {
          automationJobId,
          status: AutomationJobRunStatus.PENDING,
          scheduledFor,
        },
        select: { id: true },
      });

      return run.id;
    });
  } catch (error) {
    if (isDuplicateError(error)) return null;

    throw error;
  }
}

async function deferAutomationJobUntilNextRun({
  automationJobId,
  scheduledFor,
  cronExpression,
  now,
}: {
  automationJobId: string;
  scheduledFor: Date;
  cronExpression: string;
  now: Date;
}) {
  const baselineFromDate = scheduledFor > now ? scheduledFor : now;
  const nextRunAt = getNextAutomationJobRunAt({
    cronExpression,
    fromDate: baselineFromDate,
  });

  const update = await prisma.automationJob.updateMany({
    where: {
      id: automationJobId,
      enabled: true,
      nextRunAt: scheduledFor,
    },
    data: { nextRunAt },
  });

  if (update.count === 0) return null;

  return nextRunAt;
}
