import { NextResponse } from "next/server";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import { type RequestWithLogger, withError } from "@/utils/middleware";
import { resumeStalledBulkInboxActionJobs } from "@/utils/bulk-inbox-action/resume-stalled-job";

export const maxDuration = 300;

export const GET = withError(
  "cron/bulk-inbox-action-recovery",
  async (request) => {
    if (!hasCronSecret(request)) {
      captureException(
        new Error("Unauthorized request: api/cron/bulk-inbox-action-recovery"),
      );
      return new Response("Unauthorized", { status: 401 });
    }

    return runRecovery(request);
  },
);

export const POST = withError(
  "cron/bulk-inbox-action-recovery",
  async (request) => {
    if (!(await hasPostCronSecret(request))) {
      captureException(
        new Error(
          "Unauthorized cron request: api/cron/bulk-inbox-action-recovery",
        ),
      );
      return new Response("Unauthorized", { status: 401 });
    }

    return runRecovery(request);
  },
);

async function runRecovery(request: RequestWithLogger) {
  const result = await resumeStalledBulkInboxActionJobs({
    logger: request.logger,
  });
  return NextResponse.json(result);
}
