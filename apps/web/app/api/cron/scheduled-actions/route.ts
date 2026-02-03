import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { hasCronSecret } from "@/utils/cron";
import prisma from "@/utils/prisma";
import { ScheduledActionStatus } from "@/generated/prisma/enums";
import { markQStashActionAsExecuting } from "@/utils/scheduled-actions/scheduler";
import { executeScheduledAction } from "@/utils/scheduled-actions/executor";
import { createEmailProvider } from "@/utils/email/provider";
import type { Logger } from "@/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = withError(
  "cron/scheduled-actions",
  async (request) => {
    if (!hasCronSecret(request)) {
      request.logger.error("Unauthorized cron request");
      return new Response("Unauthorized", { status: 401 });
    }

    const result = await runScheduledActions(request.logger);
    return NextResponse.json(result);
  },
);

export const POST = withError(
  "cron/scheduled-actions",
  async (request) => {
    if (!hasCronSecret(request)) {
      request.logger.error("Unauthorized cron request");
      return new Response("Unauthorized", { status: 401 });
    }

    const result = await runScheduledActions(request.logger);
    return NextResponse.json(result);
  },
);

async function runScheduledActions(logger: Logger) {
  const dueActions = await prisma.scheduledAction.findMany({
    where: {
      status: ScheduledActionStatus.PENDING,
      scheduledFor: { lte: new Date() },
    },
    include: {
      emailAccount: {
        include: {
          account: true,
        },
      },
    },
    orderBy: { scheduledFor: "asc" },
    take: 100,
  });

  const summary = {
    total: dueActions.length,
    processed: 0,
    skipped: 0,
    failed: 0,
  };

  for (const scheduledAction of dueActions) {
    if (!scheduledAction.emailAccount?.account?.provider) {
      logger.error("Email account or provider missing", {
        scheduledActionId: scheduledAction.id,
      });
      summary.skipped += 1;
      continue;
    }

    const markedAction = await markQStashActionAsExecuting(
      scheduledAction.id,
    );
    if (!markedAction) {
      summary.skipped += 1;
      continue;
    }

    try {
      const provider = await createEmailProvider({
        emailAccountId: scheduledAction.emailAccountId,
        provider: scheduledAction.emailAccount.account.provider,
        logger,
      });

      const executionResult = await executeScheduledAction(
        markedAction,
        provider,
        logger,
      );

      if (executionResult.success) {
        summary.processed += 1;
      } else {
        summary.failed += 1;
      }
    } catch (error) {
      logger.error("Failed to execute scheduled action", {
        scheduledActionId: scheduledAction.id,
        error,
      });
      summary.failed += 1;
    }
  }

  return summary;
}
