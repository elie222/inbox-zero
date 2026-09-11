import { NextResponse } from "next/server";
import { subDays } from "date-fns/subDays";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import {
  getCronSecretHeader,
  hasCronSecret,
  hasPostCronSecret,
} from "@/utils/cron";
import { Frequency } from "@/generated/prisma/enums";
import { captureException } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import { getPremiumUserFilter } from "@/utils/premium";
import type { SendInboxHealthEmailBody } from "../validation";
import {
  INBOX_HEALTH_INTERVAL_DAYS,
  INBOX_HEALTH_MIN_ACCOUNT_AGE_DAYS,
} from "../helpers";
import { enqueueBackgroundJob } from "@/utils/queue/dispatch";

export const maxDuration = 300;
const RESEND_INBOX_HEALTH_TOPIC = "resend-inbox-health";

export const GET = withError(
  "cron/resend/inbox-health/all",
  async (request) => {
    if (!hasCronSecret(request)) {
      captureException(
        new Error("Unauthorized request: api/resend/inbox-health/all"),
      );
      return new Response("Unauthorized", { status: 401 });
    }

    const result = await sendInboxHealthAllUpdate(request.logger);

    return NextResponse.json(result);
  },
);

export const POST = withError(
  "cron/resend/inbox-health/all",
  async (request) => {
    if (!(await hasPostCronSecret(request))) {
      captureException(
        new Error("Unauthorized cron request: api/resend/inbox-health/all"),
      );
      return new Response("Unauthorized", { status: 401 });
    }

    const result = await sendInboxHealthAllUpdate(request.logger);

    return NextResponse.json(result);
  },
);

async function sendInboxHealthAllUpdate(logger: Logger) {
  logger.info("Sending inbox health all update");

  const now = new Date();

  const emailAccounts = await prisma.emailAccount.findMany({
    select: { id: true },
    where: {
      statsEmailFrequency: {
        not: Frequency.NEVER,
      },
      ...getPremiumUserFilter(),
      createdAt: {
        lt: subDays(now, INBOX_HEALTH_MIN_ACCOUNT_AGE_DAYS),
      },
      OR: [
        { lastInboxHealthEmailAt: null },
        {
          lastInboxHealthEmailAt: {
            lt: subDays(now, INBOX_HEALTH_INTERVAL_DAYS),
          },
        },
      ],
    },
  });

  logger.info("Sending inbox health to users", {
    count: emailAccounts.length,
  });

  const deduplicationDate = now.toISOString().slice(0, 10);

  for (const emailAccount of emailAccounts) {
    try {
      await enqueueBackgroundJob<SendInboxHealthEmailBody>({
        topic: RESEND_INBOX_HEALTH_TOPIC,
        body: { emailAccountId: emailAccount.id },
        qstash: {
          queueName: "email-inbox-health-all",
          parallelism: 3,
          path: "/api/resend/inbox-health",
          headers: getCronSecretHeader(),
          deduplicationId: `inbox-health:${emailAccount.id}:${deduplicationDate}`,
        },
        logger,
      });
    } catch (error) {
      logger.error("Failed to enqueue inbox health send", {
        emailAccountId: emailAccount.id,
        error,
      });
    }
  }

  logger.info("All requests initiated", { count: emailAccounts.length });
  return { count: emailAccounts.length };
}
