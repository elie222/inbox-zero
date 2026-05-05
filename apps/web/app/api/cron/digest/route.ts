import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import { runDailyDigest } from "@/utils/digest/run-daily-digest";

export const maxDuration = 300;

export const GET = withError("cron/digest", async (request) => {
  if (!hasCronSecret(request)) {
    captureException(new Error("Unauthorized request: api/cron/digest"));
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await runDailyDigest(request.logger);
  return NextResponse.json(result);
});

export const POST = withError("cron/digest", async (request) => {
  if (!(await hasPostCronSecret(request))) {
    captureException(new Error("Unauthorized cron request: api/cron/digest"));
    return new Response("Unauthorized", { status: 401 });
  }
  const result = await runDailyDigest(request.logger);
  return NextResponse.json(result);
});
