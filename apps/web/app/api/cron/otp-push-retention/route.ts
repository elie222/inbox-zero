import { NextResponse } from "next/server";
import { hasCronSecret, hasPostCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import { type RequestWithLogger, withError } from "@/utils/middleware";
import { deleteExpiredOtpPushNotifications } from "@/utils/otp-push-retention";

export const maxDuration = 300;

export const GET = withError("cron/otp-push-retention", async (request) => {
  if (!hasCronSecret(request)) {
    captureException(
      new Error("Unauthorized request: api/cron/otp-push-retention"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  return runRetention(request);
});

export const POST = withError("cron/otp-push-retention", async (request) => {
  if (!(await hasPostCronSecret(request))) {
    captureException(
      new Error("Unauthorized cron request: api/cron/otp-push-retention"),
    );
    return new Response("Unauthorized", { status: 401 });
  }

  return runRetention(request);
});

async function runRetention(request: RequestWithLogger) {
  const deleted = await deleteExpiredOtpPushNotifications();
  request.logger.info("Deleted expired OTP push notification claims", {
    count: deleted,
  });
  return NextResponse.json({ deleted });
}
