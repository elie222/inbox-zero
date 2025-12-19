import { sendColdEmailNotification as sendColdEmailNotificationViaResend } from "@inboxzero/resend";
import { env } from "@/env";
import { getErrorMessage } from "@/utils/error";
import type { Logger } from "@/utils/logger";
import { formatReplySubject } from "@/utils/email/subject";

export async function sendColdEmailNotification({
  senderEmail,
  recipientEmail,
  originalSubject,
  originalMessageId,
  logger,
}: {
  senderEmail: string; // The cold emailer we're notifying
  recipientEmail: string; // The user who received the cold email
  originalSubject: string;
  originalMessageId?: string; // Message-ID of the original email for threading
  logger: Logger;
}): Promise<{ success: boolean; error?: string }> {
  if (!env.RESEND_API_KEY) {
    logger.warn("Resend not configured, skipping cold email notification");
    return { success: false, error: "Resend not configured" };
  }

  const subject = formatReplySubject(originalSubject);

  try {
    const result = await sendColdEmailNotificationViaResend({
      from: env.RESEND_FROM_EMAIL,
      to: senderEmail,
      replyTo: recipientEmail,
      subject,
      inReplyTo: originalMessageId,
      emailProps: {
        baseUrl: env.NEXT_PUBLIC_BASE_URL,
      },
    });

    if (result.error) {
      const errorMessage =
        getErrorMessage(result.error) ??
        "Failed to send cold email notification";
      logger.error("Failed to send cold email notification", {
        error: result.error,
        senderEmail,
      });
      return { success: false, error: errorMessage };
    }

    logger.info("Cold email notification sent", {
      senderEmail,
      messageId: result.data?.id,
    });

    return { success: true };
  } catch (error) {
    logger.error("Error sending cold email notification", {
      error,
      senderEmail,
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
