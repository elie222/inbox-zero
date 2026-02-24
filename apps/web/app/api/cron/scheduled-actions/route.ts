import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import prisma from "@/utils/prisma";
import { ScheduledActionStatus } from "@/generated/prisma/enums";
import { createEmailProvider } from "@/utils/email/provider";
import { executeScheduledAction } from "@/utils/scheduled-actions/executor";
import { markQStashActionAsExecuting } from "@/utils/scheduled-actions/scheduler";
import { env } from "@/env";
import type { Logger } from "@/utils/logger";

export const maxDuration = 300;

const BATCH_SIZE = 100;

export const GET = withError("cron/scheduled-actions", async (request) => {
  if (!hasCronSecret(request)) {
    captureException(
      new Error("Unauthorized request: api/cron/scheduled-actions"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  if (env.QSTASH_TOKEN) {
    request.logger.info("QStash configured, skipping cron fallback");
    return NextResponse.json({ skipped: true, reason: "qstash-configured" });
  }

  const result = await processScheduledActions(request.logger);

  return NextResponse.json(result);
});

export const POST = withError("cron/scheduled-actions", async (request) => {
  if (!(await hasPostCronSecret(request))) {
    captureException(
      new Error("Unauthorized cron request: api/cron/scheduled-actions"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  if (env.QSTASH_TOKEN) {
    request.logger.info("QStash configured, skipping cron fallback");
    return NextResponse.json({ skipped: true, reason: "qstash-configured" });
  }

  const result = await processScheduledActions(request.logger);

  return NextResponse.json(result);
});

async function processScheduledActions(logger: Logger) {
  const now = new Date();

  const scheduledActions = await prisma.scheduledAction.findMany({
    where: {
      status: ScheduledActionStatus.PENDING,
      scheduledFor: { lte: now },
    },
    orderBy: { scheduledFor: "asc" },
    take: BATCH_SIZE,
    include: {
      emailAccount: {
        include: {
          account: true,
        },
      },
      executedRule: true,
    },
  });

  if (scheduledActions.length === 0) {
    return { processed: 0, failed: 0, skipped: 0, total: 0 };
  }

  let processed = 0;
  let failed = 0;
  let skipped = 0;

  for (const scheduledAction of scheduledActions) {
    const actionLogger = logger.with({
      scheduledActionId: scheduledAction.id,
      emailAccountId: scheduledAction.emailAccountId,
    });

    try {
      if (!scheduledAction.emailAccount?.account?.provider) {
        actionLogger.error("Email account or provider missing", {
          scheduledActionId: scheduledAction.id,
        });
        await prisma.scheduledAction.update({
          where: { id: scheduledAction.id },
          data: { status: ScheduledActionStatus.FAILED },
        });
        failed += 1;
        continue;
      }

      const markedAction = await markQStashActionAsExecuting(
        scheduledAction.id,
      );
      if (!markedAction) {
        skipped += 1;
        continue;
      }

      const provider = await createEmailProvider({
        emailAccountId: scheduledAction.emailAccountId,
        provider: scheduledAction.emailAccount.account.provider,
        logger: actionLogger,
      });

      const executionResult = await executeScheduledAction(
        scheduledAction,
        provider,
        actionLogger,
      );

      if (executionResult.success) {
        processed += 1;
      } else {
        failed += 1;
      }
    } catch (error) {
      actionLogger.error("Scheduled action execution failed", { error });
      await prisma.scheduledAction.update({
        where: { id: scheduledAction.id },
        data: { status: ScheduledActionStatus.FAILED },
      });
      failed += 1;
    }
  }

  return {
    processed,
    failed,
    skipped,
    total: scheduledActions.length,
  };
}
