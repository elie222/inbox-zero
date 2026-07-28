import { NextResponse } from "next/server";
import { env } from "@/env";
import { runWithBoundedConcurrency } from "@/utils/async";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import { MEETING_RECORDER_MIN_TIER } from "@/utils/meeting-recorder/config";
import {
  reconcileAccount,
  sweepRecordings,
} from "@/utils/meeting-recorder/reconcile";
import { withError } from "@/utils/middleware";
import { getPremiumUserFilter } from "@/utils/premium";
import prisma from "@/utils/prisma";

export const maxDuration = 800;
const MEETING_RECORDER_ACCOUNT_CONCURRENCY = 5;

export const GET = withError("meeting-recorder/schedule", async (request) => {
  if (!hasCronSecret(request)) {
    captureException(
      new Error("Unauthorized request: api/meeting-recorder/schedule"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  return NextResponse.json(await scheduleAllMeetingRecordings(request.logger));
});

export const POST = withError("meeting-recorder/schedule", async (request) => {
  if (!(await hasPostCronSecret(request))) {
    captureException(
      new Error("Unauthorized cron request: api/meeting-recorder/schedule"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  return NextResponse.json(await scheduleAllMeetingRecordings(request.logger));
});

async function scheduleAllMeetingRecordings(logger: Logger) {
  if (!env.RECALL_API_KEY) {
    logger.info("Skipping meeting recorder: no bot provider configured");
    return { total: 0, success: 0, errors: 0 };
  }

  const emailAccounts = await prisma.emailAccount.findMany({
    where: {
      meetingRecorderEnabled: true,
      ...getPremiumUserFilter({ minimumTier: MEETING_RECORDER_MIN_TIER }),
      calendarConnections: { some: { isConnected: true } },
    },
    select: {
      id: true,
      email: true,
      meetingRecorderJoinRule: true,
    },
  });

  logger.info("Found eligible meeting recorder accounts", {
    count: emailAccounts.length,
  });

  const results = await runWithBoundedConcurrency({
    items: emailAccounts,
    concurrency: MEETING_RECORDER_ACCOUNT_CONCURRENCY,
    run: (emailAccount) =>
      reconcileAccount({
        emailAccount,
        logger: logger.with({
          emailAccountId: emailAccount.id,
          email: emailAccount.email,
        }),
      }),
  });

  let successCount = 0;
  let errorCount = 0;

  for (const { item: emailAccount, result } of results) {
    if (result.status === "fulfilled") {
      successCount++;
      continue;
    }

    logger
      .with({ emailAccountId: emailAccount.id, email: emailAccount.email })
      .error("Failed to reconcile meeting recordings for user", {
        error: result.reason,
      });
    captureException(result.reason);
    errorCount++;
  }

  await sweepRecordings({ logger });

  logger.info("Completed meeting recorder reconciliation", {
    total: emailAccounts.length,
    success: successCount,
    errors: errorCount,
  });

  return {
    total: emailAccounts.length,
    success: successCount,
    errors: errorCount,
  };
}
