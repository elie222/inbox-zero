import { NextResponse } from "next/server";
import { env } from "@/env";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import { type RequestWithLogger, withError } from "@/utils/middleware";
import { enforceConfiguredReasoningRetention } from "@/utils/privacy/reasoning-retention";

export const maxDuration = 300;

export const GET = withError("cron/reasoning-retention", async (request) => {
  if (!hasCronSecret(request)) {
    captureException(
      new Error("Unauthorized request: api/cron/reasoning-retention"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  return runReasoningRetention(request);
});

export const POST = withError("cron/reasoning-retention", async (request) => {
  if (!(await hasPostCronSecret(request))) {
    captureException(
      new Error("Unauthorized cron request: api/cron/reasoning-retention"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  return runReasoningRetention(request);
});

async function runReasoningRetention(request: RequestWithLogger) {
  const result = await enforceConfiguredReasoningRetention({
    days: env.REASONING_RETENTION_DAYS,
    logger: request.logger,
  });

  return NextResponse.json(result);
}
