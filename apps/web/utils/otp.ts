import type { EmailThread } from "@/utils/email/types";
import { getMessageTimestamp } from "@/utils/email/message-timestamp";
import type { ParsedMessage } from "@/utils/types";
import { isOtpSubject } from "@inboxzero/mail-core/otp";

export const OTP_MAX_AGE_MS = 15 * 60 * 1000;

export function isRecentOtpMessage(
  message: ParsedMessage,
  now = new Date(),
): boolean {
  const receivedAt = getMessageTimestamp(message);
  const currentTime = now.getTime();

  return (
    Number.isFinite(receivedAt) &&
    receivedAt >= currentTime - OTP_MAX_AGE_MS &&
    receivedAt <= currentTime &&
    isOtpSubject(message.subject)
  );
}

export function getRecentOtpThreads(
  threads: EmailThread[],
  now = new Date(),
): EmailThread[] {
  return threads.flatMap((thread) => {
    const messages = thread.messages.filter((message) =>
      isRecentOtpMessage(message, now),
    );
    return messages.length > 0 ? [{ ...thread, messages }] : [];
  });
}
