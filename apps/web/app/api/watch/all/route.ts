import { NextResponse } from "next/server";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { withError } from "@/utils/middleware";
import { captureException } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import { ensureEmailAccountsWatched } from "@/utils/email/watch-manager";
import { cleanupExpiredEmails } from "@/utils/expiration/process-expired";

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
    // Existing: Ensure email accounts are watched
    const watchResults = await ensureEmailAccountsWatched({
      userIds: null,
      logger,
    });

    // Run expiration cleanup (every 6 hours is fine for this)
    // Wrapped in try-catch to not break watch functionality on cleanup errors
    let expirationCleanup = { totalArchived: 0, totalErrors: 0 };
    try {
      expirationCleanup = await cleanupExpiredEmails(logger);
    } catch (error) {
      logger.error("Expiration cleanup failed", { error });
      // Don't throw - let the cron succeed even if cleanup fails
    }

    return NextResponse.json({
      success: true,
      results: watchResults,
      expirationCleanup,
    });
  } catch (error) {
    logger.error("Failed to watch all emails", { error });
    throw error;
  }
}
