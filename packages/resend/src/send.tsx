import { render } from "@react-email/render";
import { nanoid } from "nanoid";
import type { ReactElement } from "react";
import {
  deliverTransactionalEmail,
  isTransactionalEmailConfigured,
} from "./delivery";
import type {
  TransactionalEmailAttachment,
  TransactionalEmailProviderResult,
} from "./provider";
import SummaryEmail, { type SummaryEmailProps } from "../emails/summary";
import DigestEmail, {
  type DigestEmailProps,
  generateDigestSubject,
} from "../emails/digest";
import InboxHealthEmail, {
  getSenderCountText,
  type InboxHealthEmailProps,
} from "../emails/inbox-health";
import InvitationEmail, {
  type InvitationEmailProps,
} from "../emails/invitation";
import ReconnectionEmail, {
  type ReconnectionEmailProps,
} from "../emails/reconnection";
import ActionRequiredEmail, {
  type ActionRequiredEmailProps,
} from "../emails/action-required";
import MeetingBriefingEmail, {
  type MeetingBriefingEmailProps,
  generateMeetingBriefingSubject,
} from "../emails/meeting-briefing";
import MeetingRecapEmail, {
  type MeetingRecapEmailProps,
  generateMeetingRecapSubject,
} from "../emails/meeting-recap";
import ColdEmailNotification, {
  type ColdEmailNotificationProps,
} from "../emails/cold-email-notification";
import GuestBookingConfirmationEmail, {
  type GuestBookingConfirmationEmailProps,
} from "../emails/guest-booking-confirmation";
import HostBookingConfirmationEmail, {
  type HostBookingConfirmationEmailProps,
} from "../emails/host-booking-confirmation";
import HostBookingCancellationEmail, {
  type HostBookingCancellationEmailProps,
} from "../emails/host-booking-cancellation";
import GuestBookingRescheduledEmail, {
  type GuestBookingRescheduledEmailProps,
} from "../emails/guest-booking-rescheduled";
import HostBookingRescheduledEmail, {
  type HostBookingRescheduledEmailProps,
} from "../emails/host-booking-rescheduled";
import InvoiceEmail, { type InvoiceEmailProps } from "../emails/invoice";

const RESEND_NOT_CONFIGURED_MESSAGE =
  "Resend is not configured. You need to add a RESEND_API_KEY in your .env file for emails to work.";

type EmailSendResult = {
  data: { id: string } | null;
  error: null;
};

const sendEmail = async ({
  from,
  to,
  subject,
  react,
  test,
  tags,
  unsubscribeToken,
  baseUrl,
}: {
  from: string;
  to: string;
  subject: string;
  react: ReactElement;
  test?: boolean;
  entityRefId?: string;
  tags?: { name: string; value: string }[];
  unsubscribeToken: string;
  baseUrl: string;
}): Promise<EmailSendResult | undefined> => {
  if (!isTransactionalEmailConfigured()) {
    console.log(RESEND_NOT_CONFIGURED_MESSAGE);
    return;
  }

  const [html, text] = await Promise.all([
    render(react),
    render(react, { plainText: true }),
  ]);

  const result = await deliverTransactionalEmail(
    {
      from,
      to,
      subject,
      html,
      text,
      headers: {
        "List-Unsubscribe": `<${baseUrl}/api/unsubscribe?token=${unsubscribeToken}>`,
        // From Feb 2024 Google requires this for bulk senders
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
        // Prevent threading on Gmail
        "X-Entity-Ref-ID": nanoid(),
      },
      tags,
    },
    { test },
  );

  return toEmailSendResult(result);
};

const sendTransactionalEmail = async ({
  from,
  to,
  subject,
  react,
  test,
  tags,
  attachments,
  idempotencyKey,
}: {
  from: string;
  to: string;
  subject: string;
  react: ReactElement;
  test?: boolean;
  tags?: { name: string; value: string }[];
  attachments?: TransactionalEmailAttachment[];
  idempotencyKey?: string;
}): Promise<EmailSendResult | undefined> => {
  if (!isTransactionalEmailConfigured()) {
    console.log(RESEND_NOT_CONFIGURED_MESSAGE);
    return;
  }

  const [html, text] = await Promise.all([
    render(react),
    render(react, { plainText: true }),
  ]);

  const result = await deliverTransactionalEmail(
    {
      from,
      to,
      subject,
      html,
      text,
      attachments,
      headers: {
        "X-Entity-Ref-ID": nanoid(),
      },
      tags,
    },
    { idempotencyKey, test },
  );

  return toEmailSendResult(result);
};

// export const sendStatsEmail = async ({
//   to,
//   test,
//   unsubscribeToken,
//   emailProps,
// }: {
//   to: string;
//   test?: boolean;
//   unsubscribeToken: string;
//   emailProps: StatsUpdateEmailProps;
// }) => {
//   // sendEmail({
//   //   to,
//   //   subject: "Your weekly email stats",
//   //   react: <StatsUpdateEmail {...emailProps} />,
//   //   test,
//   //   tags: [
//   //     {
//   //       name: "category",
//   //       value: "stats",
//   //     },
//   //   ],
//   // });
// };

export const sendSummaryEmail = async ({
  from,
  to,
  test,
  emailProps,
}: {
  from: string;
  to: string;
  test?: boolean;
  emailProps: SummaryEmailProps;
}) =>
  sendEmail({
    from,
    to,
    subject: "Your weekly email summary",
    react: <SummaryEmail {...emailProps} />,
    test,
    unsubscribeToken: emailProps.unsubscribeToken,
    baseUrl: emailProps.baseUrl,
    tags: [
      {
        name: "category",
        value: "activity-update",
      },
    ],
  });

export const sendDigestEmail = async ({
  from,
  to,
  test,
  emailProps,
}: {
  from: string;
  to: string;
  test?: boolean;
  emailProps: DigestEmailProps;
}) =>
  sendEmail({
    from,
    to,
    subject: generateDigestSubject(emailProps),
    react: <DigestEmail {...emailProps} />,
    test,
    unsubscribeToken: emailProps.unsubscribeToken,
    baseUrl: emailProps.baseUrl,
    tags: [
      {
        name: "category",
        value: "digest",
      },
    ],
  });

export const sendInboxHealthEmail = async ({
  from,
  to,
  test,
  emailProps,
}: {
  from: string;
  to: string;
  test?: boolean;
  emailProps: InboxHealthEmailProps;
}) =>
  sendEmail({
    from,
    to,
    subject: `We found ${getSenderCountText(emailProps.suggestionCount)} you rarely read`,
    react: <InboxHealthEmail {...emailProps} />,
    test,
    unsubscribeToken: emailProps.unsubscribeToken,
    baseUrl: emailProps.baseUrl,
    tags: [
      {
        name: "category",
        value: "inbox-health",
      },
    ],
  });

export const sendInvitationEmail = async ({
  from,
  to,
  test,
  emailProps,
}: {
  from: string;
  to: string;
  test?: boolean;
  emailProps: InvitationEmailProps;
}) =>
  sendEmail({
    from,
    to,
    subject: `You're invited to join ${emailProps.organizationName} on Inbox Zero`,
    react: <InvitationEmail {...emailProps} />,
    test,
    unsubscribeToken: emailProps.unsubscribeToken,
    baseUrl: emailProps.baseUrl,
    tags: [
      {
        name: "category",
        value: "invitation",
      },
    ],
  });

export const sendReconnectionEmail = async ({
  from,
  to,
  test,
  emailProps,
}: {
  from: string;
  to: string;
  test?: boolean;
  emailProps: ReconnectionEmailProps;
}) =>
  sendEmail({
    from,
    to,
    subject: `Reconnect your email account: ${emailProps.email}`,
    react: <ReconnectionEmail {...emailProps} />,
    test,
    unsubscribeToken: emailProps.unsubscribeToken,
    baseUrl: emailProps.baseUrl,
    tags: [
      {
        name: "category",
        value: "reconnection",
      },
    ],
  });

export const sendActionRequiredEmail = async ({
  from,
  to,
  test,
  emailProps,
}: {
  from: string;
  to: string;
  test?: boolean;
  emailProps: ActionRequiredEmailProps;
}) =>
  sendEmail({
    from,
    to,
    subject: `Action Required: ${emailProps.errorType}`,
    react: <ActionRequiredEmail {...emailProps} />,
    test,
    unsubscribeToken: emailProps.unsubscribeToken,
    baseUrl: emailProps.baseUrl,
    tags: [
      {
        name: "category",
        value: "action-required",
      },
    ],
  });

export const sendMeetingBriefingEmail = async ({
  from,
  to,
  test,
  emailProps,
}: {
  from: string;
  to: string;
  test?: boolean;
  emailProps: MeetingBriefingEmailProps;
}) =>
  sendEmail({
    from,
    to,
    subject: generateMeetingBriefingSubject(emailProps),
    react: <MeetingBriefingEmail {...emailProps} />,
    test,
    unsubscribeToken: emailProps.unsubscribeToken,
    baseUrl: emailProps.baseUrl,
    tags: [
      {
        name: "category",
        value: "meeting-briefing",
      },
    ],
  });

export const sendMeetingRecapEmail = async ({
  from,
  to,
  test,
  emailProps,
}: {
  from: string;
  to: string;
  test?: boolean;
  emailProps: MeetingRecapEmailProps;
}) =>
  sendEmail({
    from,
    to,
    subject: generateMeetingRecapSubject(emailProps),
    react: <MeetingRecapEmail {...emailProps} />,
    test,
    unsubscribeToken: emailProps.unsubscribeToken,
    baseUrl: emailProps.baseUrl,
    tags: [
      {
        name: "category",
        value: "meeting-recap",
      },
    ],
  });

/**
 * Send a notification to a cold emailer informing them their email was filtered.
 * This is different from other emails - it goes to an external sender, not our user,
 * so it doesn't have an unsubscribe token.
 */
export const sendColdEmailNotification = async ({
  from,
  to,
  replyTo,
  subject,
  inReplyTo,
  emailProps,
}: {
  from: string;
  to: string; // The cold emailer we're notifying
  replyTo: string; // The user who received the cold email
  subject: string;
  inReplyTo?: string; // Message-ID of original email for threading
  emailProps: ColdEmailNotificationProps;
}): Promise<EmailSendResult> => {
  if (!isTransactionalEmailConfigured()) {
    console.log(RESEND_NOT_CONFIGURED_MESSAGE);
    return { data: null, error: null };
  }

  const react = <ColdEmailNotification {...emailProps} />;
  const [html, text] = await Promise.all([
    render(react),
    render(react, { plainText: true }),
  ]);

  const result = await deliverTransactionalEmail({
    from,
    to,
    replyTo,
    subject,
    html,
    text,
    // Threading headers - In-Reply-To and References make the reply appear in the same thread
    headers: inReplyTo
      ? { "In-Reply-To": inReplyTo, References: inReplyTo }
      : undefined,
    tags: [
      {
        name: "category",
        value: "cold-email-notification",
      },
    ],
  });

  return toEmailSendResult(result);
};

export const sendGuestBookingConfirmationEmail = async ({
  from,
  to,
  test,
  emailProps,
}: {
  from: string;
  to: string;
  test?: boolean;
  emailProps: GuestBookingConfirmationEmailProps;
}) =>
  sendTransactionalEmail({
    from,
    to,
    subject: `Confirmed: ${emailProps.eventTitle}`,
    react: <GuestBookingConfirmationEmail {...emailProps} />,
    test,
    tags: [{ name: "category", value: "booking-confirmation" }],
  });

export const sendHostBookingConfirmationEmail = async ({
  from,
  to,
  test,
  emailProps,
}: {
  from: string;
  to: string;
  test?: boolean;
  emailProps: HostBookingConfirmationEmailProps;
}) =>
  sendTransactionalEmail({
    from,
    to,
    subject: `New booking: ${emailProps.eventTitle}`,
    react: <HostBookingConfirmationEmail {...emailProps} />,
    test,
    tags: [{ name: "category", value: "booking-confirmation" }],
  });

export const sendHostBookingCancellationEmail = async ({
  from,
  to,
  test,
  emailProps,
}: {
  from: string;
  to: string;
  test?: boolean;
  emailProps: HostBookingCancellationEmailProps;
}) =>
  sendTransactionalEmail({
    from,
    to,
    subject: `Booking canceled: ${emailProps.eventTitle}`,
    react: <HostBookingCancellationEmail {...emailProps} />,
    test,
    tags: [{ name: "category", value: "booking-cancellation" }],
  });

export const sendGuestBookingRescheduledEmail = async ({
  from,
  to,
  test,
  emailProps,
}: {
  from: string;
  to: string;
  test?: boolean;
  emailProps: GuestBookingRescheduledEmailProps;
}) =>
  sendTransactionalEmail({
    from,
    to,
    subject: `Rescheduled: ${emailProps.eventTitle}`,
    react: <GuestBookingRescheduledEmail {...emailProps} />,
    test,
    tags: [{ name: "category", value: "booking-rescheduled" }],
  });

export const sendHostBookingRescheduledEmail = async ({
  from,
  to,
  test,
  emailProps,
}: {
  from: string;
  to: string;
  test?: boolean;
  emailProps: HostBookingRescheduledEmailProps;
}) =>
  sendTransactionalEmail({
    from,
    to,
    subject: `Booking rescheduled: ${emailProps.eventTitle}`,
    react: <HostBookingRescheduledEmail {...emailProps} />,
    test,
    tags: [{ name: "category", value: "booking-rescheduled" }],
  });

export const sendInvoiceEmail = async ({
  from,
  to,
  test,
  emailProps,
  attachmentUrl,
  idempotencyKey,
}: {
  from: string;
  to: string;
  test?: boolean;
  emailProps: InvoiceEmailProps;
  attachmentUrl?: string;
  idempotencyKey: string;
}) =>
  sendTransactionalEmail({
    from,
    to,
    subject: "Your Inbox Zero invoice",
    react: <InvoiceEmail {...emailProps} />,
    test,
    attachments: attachmentUrl
      ? [{ filename: "invoice.pdf", path: attachmentUrl }]
      : undefined,
    idempotencyKey,
    tags: [{ name: "category", value: "invoice" }],
  });

function toEmailSendResult(
  result: TransactionalEmailProviderResult | null,
): EmailSendResult {
  return {
    data: result?.messageId ? { id: result.messageId } : null,
    error: null,
  };
}
