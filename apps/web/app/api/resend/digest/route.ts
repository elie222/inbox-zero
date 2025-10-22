import { type NextRequest, NextResponse } from "next/server";
import { withEmailAccount, withError } from "@/utils/middleware";
import { captureException } from "@/utils/error";
import { createScopedLogger } from "@/utils/logger";
import { sendDigestEmailBody } from "./validation";
import { verifySignatureAppRouter } from "@upstash/qstash/nextjs";
import { sendEmail } from "@/utils/digest/send-digest-email";

export const maxDuration = 60;

const logger = createScopedLogger("resend/digest");

export const GET = withEmailAccount(async (request) => {
  // send to self
  const emailAccountId = request.auth.emailAccountId;

  logger.info("Sending digest email to user GET", { emailAccountId });

  const result = await sendEmail({ emailAccountId, force: true });

  return NextResponse.json(result);
});

export const POST = withError(
  verifySignatureAppRouter(async (request: NextRequest) => {
    const json = await request.json();
    const { success, data, error } = sendDigestEmailBody.safeParse(json);

    if (!success) {
      logger.error("Invalid request body", { error });
      return NextResponse.json(
        { error: "Invalid request body" },
        { status: 400 },
      );
    }
    const { emailAccountId } = data;

    logger.info("Sending digest email to user POST", { emailAccountId });

    try {
      const result = await sendEmail({ emailAccountId });
      return NextResponse.json(result);
    } catch (error) {
      logger.error("Error sending digest email", { error });
      captureException(error);
      return NextResponse.json(
        { success: false, error: "Error sending digest email" },
        { status: 500 },
      );
    }
  }),
);
