import type { EmailThread } from "@/utils/email/types";
import { getMessageTimestamp } from "@/utils/email/message-timestamp";
import type { ParsedMessage } from "@/utils/types";

const OTP_SUBJECT_PATTERNS = [
  /\botp\b/i,
  /\bone[- ]time (?:code|password|passcode|pin)\b/i,
  /\b(?:verification|security|login|sign[ -]?in|authentication|confirmation|access|temporary) code\b/i,
  /\b(?:2fa|two[- ]factor(?: authentication)?) code\b/i,
  /\b(?:code|pin) (?:for|to) (?:log|sign) in\b/i,
] as const;

export const OTP_MAX_AGE_MS = 15 * 60 * 1000;

export function isOtpSubject(subject: string): boolean {
  return OTP_SUBJECT_PATTERNS.some((pattern) => pattern.test(subject));
}

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
