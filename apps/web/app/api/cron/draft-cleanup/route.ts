import { NextResponse } from "next/server";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import { type RequestWithLogger, withError } from "@/utils/middleware";
import { cleanupConfiguredAIDrafts } from "@/utils/ai/draft-cleanup";

export const maxDuration = 300;

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
  const result = await cleanupConfiguredAIDrafts({
    logger: request.logger,
  });

  return NextResponse.json(result);
}
