import { after, NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import {
  syncAppleSubscriptionToDb,
  verifyAppleNotificationPayload,
} from "@/ee/billing/apple";
import { captureException } from "@/utils/error";

type AppleNotificationBody = {
  signedPayload?: string;
};

export const POST = withError("apple/webhook", async (request) => {
  const logger = request.logger;
  const body = (await request.json()) as AppleNotificationBody;

  if (!body.signedPayload) {
    return NextResponse.json({}, { status: 400 });
  }

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
