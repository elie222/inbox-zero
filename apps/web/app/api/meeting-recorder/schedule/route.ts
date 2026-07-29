import { NextResponse } from "next/server";
import { env } from "@/env";
import { runWithBoundedConcurrency } from "@/utils/async";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import { MEETING_RECORDER_MIN_TIER } from "@/utils/meeting-recorder/config";
import { CANCELLABLE_STATUSES } from "@/utils/meeting-recorder/recording-lifecycle";
import {
  reconcileAccount,
  releaseAccountBookings,
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

  const premiumFilter = getPremiumUserFilter({
    minimumTier: MEETING_RECORDER_MIN_TIER,
  });
  const emailAccounts = await prisma.emailAccount.findMany({
    where: {
      meetingRecorderEnabled: true,
      ...premiumFilter,
      calendarConnections: { some: { isConnected: true } },
    },
    select: {
      id: true,
      email: true,
      meetingRecorderJoinRule: true,
    },
  });
  // Accounts holding live bookings that the main reconcile query no longer
  // covers: downgraded plans, a disable whose settings-time release failed, or
  // no connected calendars left. Without this their bots would never be
  // released, because such accounts drop out of the per-account reconcile
  // entirely.
  const accountsToRelease = await prisma.emailAccount.findMany({
    where: {
      meetings: {
        some: {
          recording: { status: { in: CANCELLABLE_STATUSES } },
        },
      },
      OR: [
        { meetingRecorderEnabled: false },
        { calendarConnections: { none: { isConnected: true } } },
        ...(Object.keys(premiumFilter).length === 0
          ? []
          : [{ NOT: premiumFilter }]),
      ],
    },
    select: { id: true },
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
      .with({ emailAccountId: emailAccount.id })
      .error("Failed to reconcile meeting recordings for user", {
        error: result.reason,
      });
    captureException(result.reason);
    errorCount++;
  }

  const cleanupResults = await runWithBoundedConcurrency({
    items: accountsToRelease,
    concurrency: MEETING_RECORDER_ACCOUNT_CONCURRENCY,
    run: (emailAccount) =>
      releaseAccountBookings({
        emailAccountId: emailAccount.id,
        logger: logger.with({ emailAccountId: emailAccount.id }),
      }),
  });

  for (const { item: emailAccount, result } of cleanupResults) {
    if (result.status === "fulfilled") continue;

    logger
      .with({ emailAccountId: emailAccount.id })
      .error("Failed to release meeting recordings for an ineligible account", {
        error: result.reason,
      });
    captureException(result.reason);
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
