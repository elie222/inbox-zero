import { NextResponse } from "next/server";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import { getPremiumUserFilter } from "@/utils/premium";
import { processMeetingBriefings } from "@/utils/meeting-briefs/process";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

export const GET = withError("meeting-briefs", async (request) => {
  if (!hasCronSecret(request)) {
    captureException(new Error("Unauthorized request: api/meeting-briefs"));
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await processAllMeetingBriefings(request.logger);

  return NextResponse.json(result);
});

export const POST = withError("meeting-briefs", async (request) => {
  if (!(await hasPostCronSecret(request))) {
    captureException(
      new Error("Unauthorized cron request: api/meeting-briefs"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await processAllMeetingBriefings(request.logger);

  return NextResponse.json(result);
});

async function processAllMeetingBriefings(logger: Logger) {
  logger.info("Processing meeting briefings for all users");

  // Get all email accounts with meeting briefings enabled
  const emailAccounts = await prisma.emailAccount.findMany({
    where: {
      meetingBriefingsEnabled: true,
      ...getPremiumUserFilter(),
      // Must have a calendar connected
      calendarConnections: {
        some: {
          isConnected: true,
        },
      },
    },
    select: {
      id: true,
      email: true,
      meetingBriefingsMinutesBefore: true,
      account: {
        select: {
          provider: true,
        },
      },
    },
  });

  logger.info("Found eligible accounts", { count: emailAccounts.length });

  let successCount = 0;
  let errorCount = 0;

  for (const emailAccount of emailAccounts) {
    const log = logger.with({
      emailAccountId: emailAccount.id,
      email: emailAccount.email,
    });

    try {
      await processMeetingBriefings({
        emailAccountId: emailAccount.id,
        userEmail: emailAccount.email,
        minutesBefore: emailAccount.meetingBriefingsMinutesBefore,
        logger: log,
      });
      successCount++;
    } catch (error) {
      log.error("Failed to process meeting briefings for user", { error });
      captureException(error);
      errorCount++;
    }
  }

  logger.info("Completed processing meeting briefings", {
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
