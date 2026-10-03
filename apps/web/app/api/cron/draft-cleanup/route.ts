import { NextResponse } from "next/server";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import { type RequestWithLogger, withError } from "@/utils/middleware";
import { cleanupConfiguredAIDrafts } from "@/utils/ai/draft-cleanup";
import { cleanupDraftResources } from "@/utils/email/draft-resource-cleanup";

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
  const [ai, resources] = await Promise.allSettled([
    cleanupConfiguredAIDrafts({ logger: request.logger }),
    cleanupDraftResources(request.logger),
  ]);
  for (const [job, result] of [
    ["aiDrafts", ai],
    ["draftResources", resources],
  ] as const) {
    if (result.status === "rejected") {
      request.logger.error("Draft cleanup job failed", {
        job,
        error: result.reason,
      });
      captureException(result.reason);
    }
  }
  return NextResponse.json(
    {
      ...(ai.status === "fulfilled"
        ? ai.value
        : { error: "AI draft cleanup failed." }),
      draftResources:
        resources.status === "fulfilled"
          ? resources.value
          : { error: "Draft resource cleanup failed." },
    },
    {
      status:
        ai.status === "rejected" || resources.status === "rejected" ? 500 : 200,
    },
  );
}
