import { getMessageTimestamp } from "@/utils/email/message-timestamp";
import type { Logger } from "@/utils/logger";
import { sendMobilePushNotification } from "@/utils/mobile-push";
import {
  extractOtpCode,
  isRecentOtpMessage,
  OTP_MAX_AGE_MS,
} from "@/utils/otp";
import type { ParsedMessage } from "@/utils/types";

export async function sendOtpPushNotification({
  emailAccountId,
  userId,
  message,
  logger,
  now = new Date(),
}: {
  emailAccountId: string;
  userId: string;
  message: ParsedMessage;
  logger: Logger;
  now?: Date;
}) {
  if (!isRecentOtpMessage(message, now)) return;

  const code = extractOtpCode([message.subject, message.snippet]);

  await sendMobilePushNotification({
    userId,
    deduplicationKey: `otp:${emailAccountId}:${message.id}`,
    notification: {
      title: code ? `Verification code: ${code}` : "Verification code",
      body: message.subject,
      sound: "default",
      channelId: "otp",
      priority: "high",
      ...(code ? { category: "OTP_CODE" } : {}),
      expiration: Math.floor(
        (getMessageTimestamp(message) + OTP_MAX_AGE_MS) / 1000,
      ),
      data: {
        type: "otp",
        url: `/thread/${encodeURIComponent(message.threadId)}?accountId=${encodeURIComponent(emailAccountId)}`,
        ...(code ? { code } : {}),
      },
    },
    logger,
  });
}
