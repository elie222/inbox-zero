import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import prisma from "@/utils/prisma";
import { ScheduledActionStatus } from "@/generated/prisma/enums";
import { executeScheduledAction } from "@/utils/scheduled-actions/executor";
import { markQStashActionAsExecuting } from "@/utils/scheduled-actions/scheduler";
import { createEmailProvider } from "@/utils/email/provider";

export const maxDuration = 300;

export const GET = withError("cron/scheduled-actions", async (request) => {
  if (!hasCronSecret(request)) {
    captureException(
      new Error("Unauthorized request: api/cron/scheduled-actions"),
    );
    return new Response("Unauthorized", { status: 401 });
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

  const result = await processScheduledActions(request.logger);
  return NextResponse.json(result);
});

async function processScheduledActions(logger: typeof import("@/utils/logger").logger) {
  logger.info("Processing scheduled actions via cron");

  const now = new Date();

  const dueActions = await prisma.scheduledAction.findMany({
    where: {
      status: ScheduledActionStatus.PENDING,
      scheduledFor: { lte: now },
    },
    include: {
      emailAccount: {
        include: {
          account: true,
        },
      },
      executedRule: true,
    },
    take: 50,
    orderBy: { scheduledFor: "asc" },
  });

  logger.info("Found due scheduled actions", { count: dueActions.length });

  let processed = 0;
  let failed = 0;

  for (const scheduledAction of dueActions) {
    const actionLogger = logger.with({
      scheduledActionId: scheduledAction.id,
      actionType: scheduledAction.actionType,
    });

    try {
      const markedAction = await markQStashActionAsExecuting(scheduledAction.id);
      if (!markedAction) {
        actionLogger.warn("Action already being processed or completed");
        continue;
      }

      if (!scheduledAction.emailAccount?.account?.provider) {
        actionLogger.error("Email account or provider missing");
        failed++;
        continue;
      }

      const provider = await createEmailProvider({
        emailAccountId: scheduledAction.emailAccountId,
        provider: scheduledAction.emailAccount.account.provider,
        logger: actionLogger,
      });

      const result = await executeScheduledAction(
        scheduledAction,
        provider,
        actionLogger,
      );

      if (result.success) {
        processed++;
        actionLogger.info("Successfully executed scheduled action");
      } else {
        failed++;
        actionLogger.error("Failed to execute scheduled action", {
          error: result.error,
        });
      }
    } catch (error) {
      failed++;
      actionLogger.error("Error processing scheduled action", { error });
      captureException(error);
    }
  }

  logger.info("Completed processing scheduled actions", {
    total: dueActions.length,
    processed,
    failed,
  });

  return {
    success: true,
    total: dueActions.length,
    processed,
    failed,
  };
}
