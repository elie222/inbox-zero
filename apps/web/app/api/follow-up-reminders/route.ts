import { after, NextResponse } from "next/server";
import { env } from "@/env";
import { withError } from "@/utils/middleware";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import { getInternalApiUrl } from "@/utils/internal-api";
import { runWithBackgroundLoggerFlush } from "@/utils/logger-flush";
import type { Logger } from "@/utils/logger";
import { getEligibleFollowUpReminderEmailAccountIds } from "./process";

export const maxDuration = 800;
const FOLLOW_UP_REMINDER_ACCOUNT_PATH = "/api/follow-up-reminders/account";
const MAX_CONCURRENT_DISPATCHES = 10;

export const GET = withError("follow-up-reminders", async (request) => {
  if (!hasCronSecret(request)) {
    captureException(
      new Error("Unauthorized request: api/follow-up-reminders"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  if (!env.NEXT_PUBLIC_FOLLOW_UP_REMINDERS_ENABLED) {
    request.logger.warn("Follow-up reminders feature is disabled");
    return NextResponse.json({ message: "Follow-up reminders disabled" });
  }

  return triggerFollowUpReminderFanOut(request.logger);
});

export const POST = withError("follow-up-reminders", async (request) => {
  if (!(await hasPostCronSecret(request))) {
    captureException(
      new Error("Unauthorized cron request: api/follow-up-reminders"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  if (!env.NEXT_PUBLIC_FOLLOW_UP_REMINDERS_ENABLED) {
    request.logger.warn("Follow-up reminders feature is disabled");
    return NextResponse.json({ message: "Follow-up reminders disabled" });
  }

  return triggerFollowUpReminderFanOut(request.logger);
});

async function triggerFollowUpReminderFanOut(logger: Logger) {
  const emailAccountIds = await getEligibleFollowUpReminderEmailAccountIds();
  const eligibleAccounts = emailAccountIds.length;

  logger.info("Dispatching follow-up reminders", { eligibleAccounts });

  after(() =>
    runWithBackgroundLoggerFlush({
      logger,
      task: () => dispatchFollowUpReminderAccounts(emailAccountIds, logger),
      extra: { url: "/api/follow-up-reminders" },
    }),
  );

  return NextResponse.json({
    processing: true,
    eligibleAccounts,
  });
}

async function dispatchFollowUpReminderAccounts(
  emailAccountIds: string[],
  logger: Logger,
) {
  if (!env.CRON_SECRET) {
    logger.error("No cron secret set, skipping follow-up reminder dispatch");
    return;
  }

  const url = `${getInternalApiUrl()}${FOLLOW_UP_REMINDER_ACCOUNT_PATH}`;
  const startTime = Date.now();
  let dispatchedAccounts = 0;
  let failedDispatches = 0;

  for (
    let index = 0;
    index < emailAccountIds.length;
    index += MAX_CONCURRENT_DISPATCHES
  ) {
    const batch = emailAccountIds.slice(
      index,
      index + MAX_CONCURRENT_DISPATCHES,
    );

    const batchDispatches = await Promise.all(
      batch.map((emailAccountId) =>
        dispatchFollowUpReminderAccount({
          url,
          emailAccountId,
          logger,
        }),
      ),
    );

    for (const dispatched of batchDispatches) {
      if (dispatched) {
        dispatchedAccounts++;
      } else {
        failedDispatches++;
      }
    }
  }

  logger.info("Finished follow-up reminder dispatch", {
    dispatchedAccounts,
    failedDispatches,
    processingTimeMs: Date.now() - startTime,
  });
}

async function dispatchFollowUpReminderAccount({
  url,
  emailAccountId,
  logger,
}: {
  url: string;
  emailAccountId: string;
  logger: Logger;
}): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        emailAccountId,
        CRON_SECRET: env.CRON_SECRET,
      }),
    });

    if (!response.ok) {
      logger.error("Failed to dispatch follow-up reminder account", {
        emailAccountId,
        status: response.status,
      });
      return false;
    }

    return true;
  } catch (error) {
    logger.error("Error dispatching follow-up reminder account", {
      emailAccountId,
      error,
    });
    captureException(error);
    return false;
  }
}
