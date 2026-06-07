import { NextResponse } from "next/server";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import { reconcileAllEmailInboxes } from "@/utils/email/reconcile-inbox";
import { type RequestWithLogger, withError } from "@/utils/middleware";

export const maxDuration = 800;

export const GET = withError("cron/reconcile-inbox", async (request) => {
  if (!hasCronSecret(request)) {
    captureException(
      new Error("Unauthorized request: api/cron/reconcile-inbox"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  return runInboxReconcile(request);
});

export const POST = withError("cron/reconcile-inbox", async (request) => {
  if (!(await hasPostCronSecret(request))) {
    captureException(
      new Error("Unauthorized cron request: api/cron/reconcile-inbox"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  return runInboxReconcile(request);
});

async function runInboxReconcile(request: RequestWithLogger) {
  const result = await reconcileAllEmailInboxes({
    logger: request.logger,
  });

  return NextResponse.json(result);
}
