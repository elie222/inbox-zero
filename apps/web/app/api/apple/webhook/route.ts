import { z } from "zod";
import { after, NextResponse } from "next/server";
import { env } from "@/env";
import { withError } from "@/utils/middleware";
import {
  syncAppleSubscriptionToDb,
  verifyAppleNotificationPayload,
} from "@/ee/billing/apple";
import { captureException } from "@/utils/error";

const appleNotificationBodySchema = z
  .object({
    signedPayload: z.string().min(1),
  })
  .passthrough();

export const POST = withError("apple/webhook", async (request) => {
  const logger = request.logger;
  const rawBody = await request.text();
  let parsedBody: unknown;

  try {
    parsedBody = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({}, { status: 400 });
  }

  const parsedResult = appleNotificationBodySchema.safeParse(parsedBody);

  if (!parsedResult.success) {
    return NextResponse.json({}, { status: 400 });
  }

  const body = parsedResult.data;

  let verifiedNotification: Awaited<
    ReturnType<typeof verifyAppleNotificationPayload>
  >;
  try {
    verifiedNotification = await verifyAppleNotificationPayload(
      body.signedPayload,
    );
  } catch (error) {
    logger.warn("Apple webhook verification failed", { error });
    captureException(error);
    return NextResponse.json(
      { error: "Invalid signed payload" },
      { status: 400 },
    );
  }

  after(async () => {
    try {
      if (env.SUPERWALL_APP_STORE_CONNECT_FORWARD_URL) {
        try {
          const response = await fetch(
            env.SUPERWALL_APP_STORE_CONNECT_FORWARD_URL,
            {
              method: "POST",
              headers: {
                "content-type": "application/json",
              },
              body: rawBody,
              signal: AbortSignal.timeout(5000),
            },
          );

          if (!response.ok) {
            logger.warn("Failed to forward Apple webhook to Superwall", {
              status: response.status,
              statusText: response.statusText,
            });
          }
        } catch (error) {
          logger.warn("Error forwarding Apple webhook to Superwall", { error });
          captureException(error);
        }
      }

      const { environment, notification, renewalInfo, transaction } =
        verifiedNotification;

      const resolvedTransactionId = transaction?.transactionId || null;
      const resolvedOriginalTransactionId =
        transaction?.originalTransactionId ||
        renewalInfo?.originalTransactionId ||
        null;

      if (!resolvedTransactionId && !resolvedOriginalTransactionId) {
        logger.info("Skipping Apple notification without subscription IDs", {
          notificationType: notification.notificationType,
          notificationUUID: notification.notificationUUID,
        });
        return;
      }

      await syncAppleSubscriptionToDb({
        environmentHint: environment,
        logger,
        originalTransactionId: resolvedOriginalTransactionId,
        transactionId: resolvedTransactionId,
      });

      logger.info("Apple webhook processed successfully", {
        notificationType: notification.notificationType,
        notificationUUID: notification.notificationUUID,
        originalTransactionId: resolvedOriginalTransactionId,
        transactionId: resolvedTransactionId,
      });
    } catch (error) {
      logger.error("Apple webhook processing failed", { error });
      captureException(error);
    }
  });

  return NextResponse.json({ received: true });
});
