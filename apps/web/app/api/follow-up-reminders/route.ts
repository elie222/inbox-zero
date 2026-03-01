import { after, NextResponse } from "next/server";
import { send } from "@vercel/queue";
import { env } from "@/env";
import { withError } from "@/utils/middleware";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import { getInternalApiUrl } from "@/utils/internal-api";
import { runWithBackgroundLoggerFlush } from "@/utils/logger-flush";
import type { Logger } from "@/utils/logger";
import { runWithBoundedConcurrency } from "@/utils/async";
import { getEligibleFollowUpReminderEmailAccountIds } from "./process";

export const maxDuration = 800;
const FOLLOW_UP_REMINDER_ACCOUNT_PATH = "/api/follow-up-reminders/account";
const FOLLOW_UP_REMINDER_ACCOUNT_TOPIC = "follow-up-reminders-account";
const INTERNAL_DISPATCH_CONCURRENCY = 10;
const QUEUE_ENQUEUE_CONCURRENCY = 10;

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
  if (isVercelQueueDispatchEnabled()) {
    const queueResult = await dispatchFollowUpReminderAccountsToQueue({
      emailAccountIds,
      logger,
    });

    if (queueResult.failedEmailAccountIds.length === 0) return;

    logger.warn(
      "Falling back to internal account dispatch for queue failures",
      {
        failedDispatches: queueResult.failedDispatches,
      },
    );

    await dispatchFollowUpReminderAccountsInternally({
      emailAccountIds: queueResult.failedEmailAccountIds,
      logger,
    });
    return;
  }

  await dispatchFollowUpReminderAccountsInternally({
    emailAccountIds,
    logger,
  });
}

async function dispatchFollowUpReminderAccountsToQueue({
  emailAccountIds,
  logger,
}: {
  emailAccountIds: string[];
  logger: Logger;
}) {
  const startTime = Date.now();
  const sendResults = await runWithBoundedConcurrency({
    items: emailAccountIds,
    concurrency: QUEUE_ENQUEUE_CONCURRENCY,
    run: async (emailAccountId) =>
      send(FOLLOW_UP_REMINDER_ACCOUNT_TOPIC, { emailAccountId }),
  });

  let dispatchedAccounts = 0;
  let failedDispatches = 0;
  const failedEmailAccountIds: string[] = [];

  for (const result of sendResults) {
    if (result.result.status === "fulfilled") {
      dispatchedAccounts++;
      continue;
    }

    failedDispatches++;
    failedEmailAccountIds.push(result.item);
    logger.error("Failed to enqueue follow-up reminder account", {
      emailAccountId: result.item,
      error: result.result.reason,
    });
    captureException(result.result.reason);
  }

  logger.info("Finished queueing follow-up reminder dispatch", {
    dispatchedAccounts,
    failedDispatches,
    processingTimeMs: Date.now() - startTime,
  });

  return { dispatchedAccounts, failedDispatches, failedEmailAccountIds };
}

async function dispatchFollowUpReminderAccountsInternally({
  emailAccountIds,
  logger,
}: {
  emailAccountIds: string[];
  logger: Logger;
}) {
  if (!env.CRON_SECRET) {
    logger.error("No cron secret set, skipping follow-up reminder dispatch");
    return;
  }

  const url = `${getInternalApiUrl()}${FOLLOW_UP_REMINDER_ACCOUNT_PATH}`;
  const startTime = Date.now();
  const dispatchResults = await runWithBoundedConcurrency({
    items: emailAccountIds,
    concurrency: INTERNAL_DISPATCH_CONCURRENCY,
    run: async (emailAccountId) =>
      dispatchFollowUpReminderAccount({
        url,
        emailAccountId,
        logger,
      }),
  });
  const dispatchedAccounts = dispatchResults.reduce((count, result) => {
    if (result.result.status !== "fulfilled") return count;
    return count + (result.result.value ? 1 : 0);
  }, 0);
  const failedDispatches = dispatchResults.length - dispatchedAccounts;

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

function isVercelQueueDispatchEnabled() {
  return process.env.VERCEL === "1";
}
