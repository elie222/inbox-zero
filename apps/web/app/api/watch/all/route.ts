import { NextResponse } from "next/server";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { withError } from "@/utils/middleware";
import { captureException } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import { ensureEmailAccountsWatched } from "@/utils/email/watch-manager";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

export const GET = withError("watch/all", async (request) => {
  if (!hasCronSecret(request)) {
    captureException(new Error("Unauthorized cron request: api/watch/all"));
    return new Response("Unauthorized", { status: 401 });
  }

  return watchAllEmails(request.logger);
});

export const POST = withError("watch/all", async (request) => {
  if (!(await hasPostCronSecret(request))) {
    captureException(new Error("Unauthorized cron request: api/watch/all"));
    return new Response("Unauthorized", { status: 401 });
  }

  return watchAllEmails(request.logger);
});

async function watchAllEmails(logger: Logger) {
  try {
    const results = await ensureEmailAccountsWatched({ userIds: null });
    return NextResponse.json({ success: true, results });
  } catch (error) {
    logger.error("Failed to watch all emails", { error });
    throw error;
  }
}
