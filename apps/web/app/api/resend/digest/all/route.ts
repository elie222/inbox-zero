import { NextResponse } from "next/server";
import subDays from "date-fns/subDays";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { env } from "@/env";
import {
  getCronSecretHeader,
  hasCronSecret,
  hasPostCronSecret,
} from "@/utils/cron";
import { captureException } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import { publishToQstashQueue } from "@/utils/upstash";

const logger = createScopedLogger("cron/resend/digest/all");

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function sendDigestAllUpdate() {
  logger.info("Sending digest all update");

  const now = new Date();

  // Get all email accounts that are due for a digest
  const emailAccounts = await prisma.emailAccount.findMany({
    where: {
      digestSchedule: {
        nextOccurrenceAt: {
          lte: now,
        },
      },
      // Only send to premium users
      user: {
        premium: {
          OR: [
            { lemonSqueezyRenewsAt: { gt: now } },
            { stripeSubscriptionStatus: { in: ["active", "trialing"] } },
          ],
        },
      },
      // User at least 4 days old
      createdAt: {
        lt: subDays(now, 4),
      },
    },
    select: {
      id: true,
      email: true,
    },
  });

  logger.info("Sending digest to users", {
    eligibleAccounts: emailAccounts.length,
  });

  const url = `${env.NEXT_PUBLIC_BASE_URL}/api/resend/digest`;

  for (const emailAccount of emailAccounts) {
    try {
      await publishToQstashQueue({
        queueName: "email-digest-all",
        parallelism: 3, // Allow up to 3 concurrent jobs from this queue
        url,
        body: { emailAccountId: emailAccount.id, CRON_SECRET: env.CRON_SECRET },
      });
    } catch (error) {
      logger.error("Failed to publish to Qstash", {
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
    captureException(new Error("Unauthorized request: api/resend/digest/all"));
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await sendDigestAllUpdate();

  return NextResponse.json(result);
});

export const POST = withError(async (request) => {
  if (!(await hasPostCronSecret(request))) {
    captureException(
      new Error("Unauthorized cron request: api/resend/digest/all"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await sendDigestAllUpdate();

  return NextResponse.json(result);
});
