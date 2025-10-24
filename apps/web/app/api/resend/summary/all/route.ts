import { NextResponse } from "next/server";
import subDays from "date-fns/subDays";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { Frequency } from "@prisma/client";
import { captureException } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import { enqueueJob } from "@/utils/queue/queue-manager";

const logger = createScopedLogger("cron/resend/summary/all");

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function sendSummaryAllUpdate() {
  logger.info("Sending summary all update");

  const emailAccounts = await prisma.emailAccount.findMany({
    select: { email: true },
    where: {
      summaryEmailFrequency: {
        not: Frequency.NEVER,
      },
      // Only send to premium users
      user: {
        premium: {
          OR: [
            { lemonSqueezyRenewsAt: { gt: new Date() } },
            { stripeSubscriptionStatus: { in: ["active", "trialing"] } },
          ],
        },
      },
      // User at least 4 days old
      createdAt: {
        lt: subDays(new Date(), 4),
      },
    },
  });

  logger.info("Sending summary to users", { count: emailAccounts.length });

  for (const emailAccount of emailAccounts) {
    try {
      await enqueueJob("email-summary-all", {
        email: emailAccount.email,
      });
    } catch (error) {
      logger.error("Failed to enqueue summary job", {
        email: emailAccount.email,
        error,
      });
    }
  }

  logger.info("All requests initiated", { count: emailAccounts.length });
  return { count: emailAccounts.length };
}

export const GET = withError(async (request) => {
  if (!hasCronSecret(request)) {
    captureException(new Error("Unauthorized request: api/resend/summary/all"));
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await sendSummaryAllUpdate();

  return NextResponse.json(result);
});

export const POST = withError(async (request) => {
  if (!(await hasPostCronSecret(request))) {
    captureException(
      new Error("Unauthorized cron request: api/resend/summary/all"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await sendSummaryAllUpdate();

  return NextResponse.json(result);
});
