import { NextResponse } from "next/server";
import { subDays } from "date-fns/subDays";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import { getPremiumUserFilter } from "@/utils/premium";
import { enqueueBackgroundJob } from "@/utils/queue/dispatch";

export const maxDuration = 300;
const RESEND_DIGEST_TOPIC = "resend-digest";

export const GET = withError("cron/resend/digest/all", async (request) => {
  if (!hasCronSecret(request)) {
    captureException(new Error("Unauthorized request: api/resend/digest/all"));
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await sendDigestAllUpdate(request.logger);

  return NextResponse.json(result);
});

export const POST = withError("cron/resend/digest/all", async (request) => {
  if (!(await hasPostCronSecret(request))) {
    captureException(
      new Error("Unauthorized cron request: api/resend/digest/all"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await sendDigestAllUpdate(request.logger);

  return NextResponse.json(result);
});

async function sendDigestAllUpdate(logger: Logger) {
  logger.info("Sending digest all update");

  const now = new Date();

  // Get all email accounts that are due for a digest
  const emailAccounts = await prisma.emailAccount.findMany({
    where: {
      digestSchedule: {
        nextOccurrenceAt: { lte: now },
      },
      ...getPremiumUserFilter({ minimumTier: "PLUS_MONTHLY" }),
      createdAt: {
        lt: subDays(now, 1),
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

  for (const emailAccount of emailAccounts) {
    try {
      await enqueueBackgroundJob({
        topic: RESEND_DIGEST_TOPIC,
        body: { emailAccountId: emailAccount.id },
        qstash: {
          queueName: "email-digest-all",
          parallelism: 3,
          path: "/api/resend/digest",
        },
        logger,
      });
    } catch (error) {
      logger.error("Failed to enqueue digest send", {
        emailAccountId: emailAccount.id,
        error,
      });
      logger.trace("Failed digest enqueue for account email", {
        email: emailAccount.email,
        error,
      });
    }
  }

  logger.info("All requests initiated", { count: emailAccounts.length });
  return { count: emailAccounts.length };
}
