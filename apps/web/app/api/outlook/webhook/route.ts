import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { processHistoryForUser } from "@/app/api/outlook/webhook/process-history";
import { logger } from "@/app/api/outlook/webhook/logger";
import { env } from "@/env";
import { webhookBodySchema } from "@/app/api/outlook/webhook/types";

export const maxDuration = 120;

export const POST = withError(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const validationToken = searchParams.get("validationToken");

  if (validationToken) {
    logger.info("Received validation request", { validationToken });
    return new NextResponse(decodeURIComponent(validationToken), {
      headers: { "Content-Type": "text/plain" },
    });
  }

  const rawBody = await request.json();

  const parseResult = webhookBodySchema.safeParse(rawBody);

  if (!parseResult.success) {
    logger.error("Invalid webhook payload", {
      body: rawBody,
      errors: parseResult.error.errors,
    });
    return NextResponse.json(
      {
        error: "Invalid webhook payload",
        details: parseResult.error.errors,
      },
      { status: 400 },
    );
  }

  const body = parseResult.data;

  // Validate clientState for security (verify webhook is from Microsoft)
  if (
    !body.clientState ||
    body.clientState !== env.MICROSOFT_WEBHOOK_CLIENT_STATE
  ) {
    logger.error("Invalid or missing clientState", {
      receivedClientState: body.clientState,
      hasExpectedClientState: !!env.MICROSOFT_WEBHOOK_CLIENT_STATE,
    });
    return NextResponse.json(
      { error: "Unauthorized webhook request" },
      { status: 403 },
    );
  }

  logger.info("Received webhook notification", {
    value: body.value,
    clientState: body.clientState,
  });

  const notifications = body.value;

  for (const notification of notifications) {
    const { subscriptionId, resourceData } = notification;

    logger.info("Processing notification", {
      subscriptionId,
      changeType: notification.changeType,
    });

    await processHistoryForUser({
      subscriptionId,
      resourceData,
    });
  }

  return NextResponse.json({ ok: true });
});
