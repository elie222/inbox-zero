import { NextResponse } from "next/server";
import { subDays } from "date-fns/subDays";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { getInternalApiUrl } from "@/utils/internal-api";
import { captureException } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import { publishToQstashQueue } from "@/utils/upstash";
import { getPremiumUserFilter } from "@/utils/premium";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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
      ...getPremiumUserFilter(),
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

  const url = `${getInternalApiUrl()}/api/resend/digest`;

  for (const emailAccount of emailAccounts) {
    try {
      await publishToQstashQueue({
        queueName: "email-digest-all",
        parallelism: 3, // Allow up to 3 concurrent jobs from this queue
        url,
        body: { emailAccountId: emailAccount.id },
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
