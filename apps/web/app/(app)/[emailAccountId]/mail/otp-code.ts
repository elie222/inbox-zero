import { getEmailThreadLabels } from "@/components/EmailMessageCellLabels";
import type { EmailLabels } from "@/providers/email-label-types";
import { SystemType } from "@/generated/prisma/enums";
import { decodeSnippet } from "@/utils/gmail/decode";
import { extractOtpCode, isOtpSubject } from "@/utils/otp";
import { getRuleLabel } from "@/utils/rule/consts";

const OTP_LABEL = getRuleLabel(SystemType.OTP).toLowerCase();

export function getThreadOtpCode(
  thread: {
    snippet: string;
    messages: { subject: string; snippet: string; labelIds?: string[] }[];
  },
  userLabels: EmailLabels,
): string | null {
  const message = thread.messages.at(-1);
  if (!message) return null;

  const labels = getEmailThreadLabels({ messages: [message], userLabels });
  const isOtp =
    labels.some((label) => label.name.toLowerCase() === OTP_LABEL) ||
    isOtpSubject(message.subject);
  return isOtp
    ? extractOtpCode([message.subject, decodeSnippet(message.snippet)])
    : null;
}
