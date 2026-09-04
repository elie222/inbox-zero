import { NextResponse } from "next/server";
import { runWithBoundedConcurrency } from "@/utils/async";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import { MEETING_RECORDER_MIN_TIER } from "@/utils/meeting-recorder/config";
import { isMeetingBotProviderConfigured } from "@/utils/meeting-recorder/create-bot-provider";
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
  if (!isMeetingBotProviderConfigured()) {
    logger.info(
      "Skipping meeting recorder: bot provider or webhook verification is not configured",
    );
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
      name: true,
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
    releaseCount: accountsToRelease.length,
  });

  const results = await runWithBoundedConcurrency({
    items: emailAccounts,
    concurrency: MEETING_RECORDER_ACCOUNT_CONCURRENCY,
    run: async (emailAccount) => {
      const accountLogger = logger.with({ emailAccountId: emailAccount.id });
      accountLogger.info("Starting meeting recorder account reconciliation");

      try {
        await reconcileAccount({ emailAccount, logger: accountLogger });
        accountLogger.info("Completed meeting recorder account reconciliation");
      } catch (error) {
        accountLogger.error("Failed meeting recorder account reconciliation", {
          error,
        });
        captureException(error, { emailAccountId: emailAccount.id });
        throw error;
      }
    },
  });

  let successCount = 0;
  let errorCount = 0;

  for (const { result } of results) {
    if (result.status === "fulfilled") {
      successCount++;
      continue;
    }

    errorCount++;
  }

  logger.info("Completed meeting recorder account phase", {
    total: emailAccounts.length,
    success: successCount,
    errors: errorCount,
  });

  const cleanupResults = await runWithBoundedConcurrency({
    items: accountsToRelease,
    concurrency: MEETING_RECORDER_ACCOUNT_CONCURRENCY,
    run: async (emailAccount) => {
      const accountLogger = logger.with({ emailAccountId: emailAccount.id });
      accountLogger.info("Starting ineligible account booking release");

      try {
        await releaseAccountBookings({
          emailAccountId: emailAccount.id,
          logger: accountLogger,
        });
        accountLogger.info("Completed ineligible account booking release");
      } catch (error) {
        accountLogger.error("Failed ineligible account booking release", {
          error,
        });
        captureException(error, { emailAccountId: emailAccount.id });
        throw error;
      }
    },
  });

  const cleanupErrors = cleanupResults.filter(
    ({ result }) => result.status === "rejected",
  ).length;
  logger.info("Completed ineligible account cleanup phase", {
    total: accountsToRelease.length,
    errors: cleanupErrors,
  });

  logger.info("Starting meeting recording sweep");
  await sweepRecordings({ logger });
  logger.info("Completed meeting recording sweep");

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
