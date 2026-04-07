import { after, NextResponse } from "next/server";
import { withError } from "@/utils/middleware";
import {
  decodeAppleNotificationPayload,
  decodeAppleTransactionPayload,
  syncAppleSubscriptionToDb,
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

  after(async () => {
    try {
      const notification = decodeAppleNotificationPayload(body.signedPayload);

      if (!notification.data?.signedTransactionInfo) {
        logger.info("Skipping Apple notification without transaction payload", {
          notificationType: notification.notificationType,
          notificationUUID: notification.notificationUUID,
        });
        return;
      }

      const transaction = decodeAppleTransactionPayload(
        notification.data.signedTransactionInfo,
      );
      const transactionId =
        transaction.originalTransactionId || transaction.transactionId;

      if (!transactionId) {
        logger.warn("Skipping Apple notification without transaction ID", {
          notificationType: notification.notificationType,
          notificationUUID: notification.notificationUUID,
        });
        return;
      }

      await syncAppleSubscriptionToDb({
        environmentHint:
          notification.data.environment || transaction.environment || null,
        logger,
        transactionId,
      });

      logger.info("Apple webhook processed successfully", {
        notificationType: notification.notificationType,
        notificationUUID: notification.notificationUUID,
        originalTransactionId: transaction.originalTransactionId,
        transactionId: transaction.transactionId,
      });
    } catch (error) {
      logger.error("Apple webhook processing failed", { error });
      captureException(error);
    }
  });

  return NextResponse.json({ received: true });
});
