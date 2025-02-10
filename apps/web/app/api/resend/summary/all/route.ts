import { NextResponse } from "next/server";
import { subDays } from "date-fns/subDays";
import prisma from "@/utils/prisma";
import { withError } from "@/utils/middleware";
import { env } from "@/env";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { Frequency } from "@prisma/client";
import { captureException } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import { sleep } from "@/utils/sleep";

const logger = createScopedLogger("cron/resend/summary/all");

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function sendSummaryAllUpdate() {
  logger.info("Sending summary all update");

  const users = await prisma.user.findMany({
    select: { email: true },
    where: {
      summaryEmailFrequency: {
        not: Frequency.NEVER,
      },
      // Only send to premium users
      premium: {
        lemonSqueezyRenewsAt: {
          gt: new Date(),
        },
      },
      // User at least 4 days old
      createdAt: {
        gt: subDays(new Date(), 4),
      },
    },
  });

  logger.info("Sending summary to users", { count: users.length });

  const url = `${env.NEXT_PUBLIC_BASE_URL}/api/resend/summary`;

  // Start all requests without waiting for responses
  await Promise.all(
    users.map((user) => {
      fetch(url, {
        method: "POST",
        body: JSON.stringify({ email: user.email }),
        headers: {
          authorization: `Bearer ${env.CRON_SECRET}`,
          "Content-Type": "application/json",
        },
      }).catch((error) => {
        // Log any request initiation errors
        logger.error("Failed to initiate request", {
          email: user.email,
          error,
        });
      });
      return Promise.resolve(); // Return immediately
    }),
  );

  // Give the requests a moment to actually start
  await sleep(2_000);

  logger.info("All requests initiated", { count: users.length });
  return { count: users.length };
}

export const GET = withError(async (request) => {
  if (!hasCronSecret(request)) {
    captureException(new Error("Unauthorized request: api/resend/summary/all"));
    logger.error("Unauthorized request: api/resend/summary/all", {
      type: "GET",
    });
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await sendSummaryAllUpdate();

  return NextResponse.json(result);
});

export const POST = withError(async (request: Request) => {
  if (!(await hasPostCronSecret(request))) {
    captureException(
      new Error("Unauthorized cron request: api/resend/summary/all"),
    );
    logger.error("Unauthorized request: api/resend/summary/all", {
      type: "POST",
    });
    return new Response("Unauthorized", { status: 401 });
  }

  const result = await sendSummaryAllUpdate();

  return NextResponse.json(result);
});
