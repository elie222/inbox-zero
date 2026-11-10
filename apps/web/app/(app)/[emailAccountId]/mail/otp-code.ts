import { getEmailThreadLabels } from "@/components/EmailMessageCellLabels";
import type { EmailLabels } from "@/providers/email-label-types";
import { SystemType } from "@/generated/prisma/enums";
import { getLatestNonDraftMessage } from "@/utils/email/latest-message";
import { getMessageTimestamp } from "@/utils/email/message-timestamp";
import { decodeSnippet } from "@/utils/gmail/decode";
import { GmailLabel } from "@/utils/gmail/label";
import { extractOtpCode, isOtpSubject } from "@/utils/otp";
import { getRuleLabel } from "@/utils/rule/consts";

const OTP_LABEL = getRuleLabel(SystemType.OTP).toLowerCase();

type OtpThread = {
  snippet: string;
  messages: {
    subject: string;
    snippet: string;
    labelIds?: string[];
    internalDate?: string | null;
    date: string;
  }[];
};

export function getThreadOtpCode(
  thread: OtpThread,
  userLabels: EmailLabels,
): string | null {
  const message = getLatestOtpMessage(thread, userLabels);
  return message
    ? extractOtpCode([message.subject, decodeSnippet(message.snippet)])
    : null;
}

/** A sign-in email, whether or not a code could be read out of it. */
export function isOtpThread(thread: OtpThread, userLabels: EmailLabels) {
  return getLatestOtpMessage(thread, userLabels) !== null;
}

function getLatestOtpMessage(thread: OtpThread, userLabels: EmailLabels) {
  const message = getLatestNonDraftMessage({
    messages: thread.messages,
    isDraft: (message) => message.labelIds?.includes(GmailLabel.DRAFT) ?? false,
    getTimestamp: getMessageTimestamp,
  });
  if (!message) return null;

  const labels = getEmailThreadLabels({ messages: [message], userLabels });
  const isOtp =
    labels.some((label) => label.name.toLowerCase() === OTP_LABEL) ||
    isOtpSubject(message.subject);
  return isOtp ? message : null;
}
