import { render } from "@react-email/render";
import { nanoid } from "nanoid";
import { resend } from "./client";
import type { ReactElement } from "react";
import SummaryEmail, { type SummaryEmailProps } from "../emails/summary";
import DigestEmail, {
  type DigestEmailProps,
  generateDigestSubject,
} from "../emails/digest";
import InvitationEmail, {
  type InvitationEmailProps,
} from "../emails/invitation";
import MeetingBriefingEmail, {
  type MeetingBriefingEmailProps,
  generateMeetingBriefingSubject,
} from "../emails/meeting-briefing";

const sendEmail = async ({
  from,
  to,
  subject,
  react,
  test,
  tags,
  unsubscribeToken,
}: {
  from: string;
  to: string;
  subject: string;
  react: ReactElement;
  test?: boolean;
  entityRefId?: string;
  tags?: { name: string; value: string }[];
  unsubscribeToken: string;
}) => {
  if (!resend) {
    console.log(
      "Resend is not configured. You need to add a RESEND_API_KEY in your .env file for emails to work.",
    );
    return Promise.resolve();
  }

  const text = await render(react, { plainText: true });

  const result = await resend.emails.send({
    from,
    to: test ? "delivered@resend.dev" : to,
    subject,
    react,
    text,
    headers: {
      "List-Unsubscribe": `<https://www.getinboxzero.com/api/unsubscribe?token=${unsubscribeToken}>`,
      // From Feb 2024 Google requires this for bulk senders
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      // Prevent threading on Gmail
      "X-Entity-Ref-ID": nanoid(),
    },
    tags,
  });

  if (result.error) {
    console.error("Error sending email", result.error);
    throw new Error(`Error sending email: ${result.error.message}`);
  }

  return result;
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
}) => {
  return sendEmail({
    from,
    to,
    subject: "Your weekly email summary",
    react: <SummaryEmail {...emailProps} />,
    test,
    unsubscribeToken: emailProps.unsubscribeToken,
    tags: [
      {
        name: "category",
        value: "activity-update",
      },
    ],
  });
};

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
}) => {
  return sendEmail({
    from,
    to,
    subject: generateDigestSubject(emailProps),
    react: <DigestEmail {...emailProps} />,
    test,
    unsubscribeToken: emailProps.unsubscribeToken,
    tags: [
      {
        name: "category",
        value: "digest",
      },
    ],
  });
};

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
}) => {
  return sendEmail({
    from,
    to,
    subject: `You're invited to join ${emailProps.organizationName} on Inbox Zero`,
    react: <InvitationEmail {...emailProps} />,
    test,
    unsubscribeToken: emailProps.unsubscribeToken,
    tags: [
      {
        name: "category",
        value: "invitation",
      },
    ],
  });
};

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
}) => {
  return sendEmail({
    from,
    to,
    subject: generateMeetingBriefingSubject(emailProps),
    react: <MeetingBriefingEmail {...emailProps} />,
    test,
    unsubscribeToken: emailProps.unsubscribeToken,
    tags: [
      {
        name: "category",
        value: "meeting-briefing",
      },
    ],
  });
};
