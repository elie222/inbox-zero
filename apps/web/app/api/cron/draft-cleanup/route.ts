import { NextResponse } from "next/server";
import {
  getCronSecretHeader,
  hasCronSecret,
  hasPostCronSecret,
} from "@/utils/cron";
import { captureException } from "@/utils/error";
import { type RequestWithLogger, withError } from "@/utils/middleware";
import { getEmailAccountsWithStaleAIDrafts } from "@/utils/ai/draft-cleanup";
import { enqueueBackgroundJob } from "@/utils/queue/dispatch";
import type { DraftCleanupAccountBody } from "./account/validation";

export const maxDuration = 300;
const DRAFT_CLEANUP_TOPIC = "draft-cleanup";
const ENQUEUE_SPACING_SECONDS = 1;

export const GET = withError("cron/draft-cleanup", async (request) => {
  if (!hasCronSecret(request)) {
    captureException(new Error("Unauthorized request: api/cron/draft-cleanup"));
    return new Response("Unauthorized", { status: 401 });
  }

  return runDraftCleanup(request);
});

export const POST = withError("cron/draft-cleanup", async (request) => {
  if (!(await hasPostCronSecret(request))) {
    captureException(
      new Error("Unauthorized cron request: api/cron/draft-cleanup"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  return runDraftCleanup(request);
});

async function runDraftCleanup(request: RequestWithLogger) {
  const logger = request.logger;
  const emailAccountIds = await getEmailAccountsWithStaleAIDrafts();

  let enqueued = 0;
  for (const [index, emailAccountId] of emailAccountIds.entries()) {
    try {
      await enqueueBackgroundJob<DraftCleanupAccountBody>({
        topic: DRAFT_CLEANUP_TOPIC,
        body: { emailAccountId },
        vercel: { delaySeconds: index * ENQUEUE_SPACING_SECONDS },
        qstash: {
          queueName: "draft-cleanup",
          parallelism: 3,
          path: "/api/cron/draft-cleanup/account",
          headers: getCronSecretHeader(),
        },
        logger,
      });
      enqueued++;
    } catch (error) {
      logger.error("Failed to enqueue draft cleanup", {
        emailAccountId,
        error,
      });
    }
  }

  logger.info("Enqueued draft cleanup", {
    accounts: emailAccountIds.length,
    enqueued,
  });

  return NextResponse.json({ accounts: emailAccountIds.length, enqueued });
}
