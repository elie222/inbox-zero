import { NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import { env } from "@/env";
import { processHistoryForUser } from "@/app/api/outlook/webhook/process-history";
import { logger } from "@/app/api/outlook/webhook/logger";

export const maxDuration = 120;

// Microsoft Graph API calls this endpoint each time a user receives an email
export const POST = withError(async (request) => {
  const searchParams = new URL(request.url).searchParams;
  const validationToken = searchParams.get("validationToken");

  // Handle subscription validation
  if (validationToken) {
    logger.info("Received validation request", { validationToken });
    return new NextResponse(validationToken, {
      headers: { "Content-Type": "text/plain" },
    });
  }

  const body = await request.json();

  logger.info("Received webhook notification", {
    value: body.value,
    clientState: body.clientState,
  });

  // Microsoft sends notifications in an array
  const notifications = body.value;

  if (!notifications || !Array.isArray(notifications)) {
    logger.error("Invalid notification format", { body });
    return NextResponse.json(
      { error: "Invalid notification format" },
      { status: 400 },
    );
  }

  // Process each notification
  for (const notification of notifications) {
    const { subscriptionId, resourceData } = notification;

    if (!subscriptionId || !resourceData) {
      logger.error("Missing required notification data", { notification });
      continue;
    }

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
