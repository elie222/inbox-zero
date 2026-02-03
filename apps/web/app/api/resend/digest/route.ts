import { NextResponse } from "next/server";
import { withEmailAccount, withError } from "@/utils/middleware";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { handleDigestEmailRequest, sendEmail } from "./handle-digest-email";

export const maxDuration = 60;

export const GET = withEmailAccount("resend/digest", async (request) => {
  const emailAccountId = request.auth.emailAccountId;

  const logger = request.logger.with({
    force: true,
  });

  logger.info("Sending digest email to user GET");

  const result = await sendEmail({ emailAccountId, force: true, logger });

  return NextResponse.json(result);
});

export const POST = verifySignatureAppRouter(
  withError("resend/digest", async (request) => {
    return handleDigestEmailRequest(request);
  }),
);
