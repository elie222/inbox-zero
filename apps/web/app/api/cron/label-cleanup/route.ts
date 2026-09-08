import { NextResponse } from "next/server";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { withError } from "@/utils/middleware";
import { captureException } from "@/utils/error";
import { runLabelCleanups } from "@/utils/label-cleanup/run-label-cleanup";

export const maxDuration = 800;

export const GET = withError("cron/label-cleanup", async (request) => {
  if (!hasCronSecret(request)) {
    captureException(new Error("Unauthorized request: api/cron/label-cleanup"));
    return new Response("Unauthorized", { status: 401 });
  }

  const results = await runLabelCleanups({ logger: request.logger });
  return NextResponse.json({ results });
});

export const POST = withError("cron/label-cleanup", async (request) => {
  if (!(await hasPostCronSecret(request))) {
    captureException(
      new Error("Unauthorized cron request: api/cron/label-cleanup"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  const results = await runLabelCleanups({ logger: request.logger });
  return NextResponse.json({ results });
});
