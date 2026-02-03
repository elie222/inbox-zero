import { NextResponse } from "next/server";
import { withEmailAccount, withError } from "@/utils/middleware";
import { hasCronSecret } from "@/utils/cron";
import { captureException } from "@/utils/error";
import { handleSummaryRequest, sendEmail } from "./handle-summary";

export const maxDuration = 60;

export const GET = withEmailAccount("resend/summary", async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  request.logger.info("Sending summary email to user GET", { emailAccountId });

  const result = await sendEmail({
    emailAccountId,
    force: true,
    logger: request.logger,
  });

  return NextResponse.json(result);
});

export const POST = withError("resend/summary", async (request) => {
  const logger = request.logger;
  if (!hasCronSecret(request)) {
    logger.error("Unauthorized cron request");
    captureException(new Error("Unauthorized cron request: resend"));
    return new Response("Unauthorized", { status: 401 });
  }

  return handleSummaryRequest(request);
});
