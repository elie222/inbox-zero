import { NextResponse } from "next/server";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { withError } from "@/utils/middleware";
import { captureException } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import { ensureEmailAccountsWatched } from "@/utils/email/watch-manager";

const logger = createScopedLogger("api/watch/all");

export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function watchAllEmails() {
  try {
    const results = await ensureEmailAccountsWatched({ userIds: null });
    return NextResponse.json({ success: true, results });
  } catch (error) {
    logger.error("Failed to watch all emails", { error });
    throw error;
  }
}

export const GET = withError(async (request) => {
  if (!hasCronSecret(request)) {
    captureException(new Error("Unauthorized cron request: api/watch/all"));
    return new Response("Unauthorized", { status: 401 });
  }

  return watchAllEmails();
});

export const POST = withError(async (request) => {
  if (!(await hasPostCronSecret(request))) {
    captureException(new Error("Unauthorized cron request: api/watch/all"));
    return new Response("Unauthorized", { status: 401 });
  }

  return watchAllEmails();
});
