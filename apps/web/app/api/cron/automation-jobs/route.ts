import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import { publishToQstashQueue } from "@/utils/upstash";
import { getNextAutomationJobRunAt } from "@/utils/automation-jobs/cron";
import {
  AutomationJobRunStatus,
  MessagingProvider,
} from "@/generated/prisma/enums";
import { isDuplicateError } from "@/utils/prisma-helpers";
import { getPremiumUserFilter } from "@/utils/premium";

export const maxDuration = 300;

const BATCH_SIZE = 100;

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
        provider: { in: [MessagingProvider.SLACK, MessagingProvider.TEAMS] },
        OR: [
          { accessToken: { not: null } },
          {
            provider: MessagingProvider.TEAMS,
            refreshToken: { not: null },
          },
        ],
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
    },
    orderBy: { nextRunAt: "asc" },
    take: BATCH_SIZE,
  });

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
      runId = await claimDueJobRun({
        automationJobId: job.id,
        scheduledFor: job.nextRunAt,
        cronExpression: job.cronExpression,
        now,
      });

      if (!runId) {
        skipped += 1;
        continue;
      }

      claimed += 1;

      await publishToQstashQueue({
        queueName: "automation-jobs",
        parallelism: 3,
        path: "/api/automation-jobs/execute",
        body: { automationJobRunId: runId },
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
