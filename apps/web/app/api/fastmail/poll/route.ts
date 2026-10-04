import { NextResponse } from "next/server";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { withError } from "@/utils/middleware";
import { captureException } from "@/utils/error";
import { pollAllFastmailAccounts } from "@/utils/fastmail/poll-sync";
import type { Logger } from "@/utils/logger";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 minutes max

export const GET = withError("fastmail/poll", async (request) => {
  if (!hasCronSecret(request)) {
    captureException(new Error("Unauthorized cron request: api/fastmail/poll"));
    return new Response("Unauthorized", { status: 401 });
  }

  return pollFastmail(request.logger);
});

export const POST = withError("fastmail/poll", async (request) => {
  if (!(await hasPostCronSecret(request))) {
    captureException(new Error("Unauthorized cron request: api/fastmail/poll"));
    return new Response("Unauthorized", { status: 401 });
  }

  return pollFastmail(request.logger);
});

async function pollFastmail(logger: Logger) {
  try {
    const results = await pollAllFastmailAccounts(logger);

    return NextResponse.json({
      success: true,
      results,
      summary: {
        total: results.length,
        successful: results.filter((r) => r.status === "success").length,
        noChanges: results.filter((r) => r.status === "no_changes").length,
        skipped: results.filter((r) => r.status === "skipped").length,
        errors: results.filter((r) => r.status === "error").length,
      },
    });
  } catch (error) {
    logger.error("Failed to poll Fastmail accounts", { error });
    throw error;
  }
}
