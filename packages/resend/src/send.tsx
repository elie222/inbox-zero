import type { JSXElementConstructor, ReactElement } from "react";
import { render } from "@react-email/render";
import { nanoid } from "nanoid";
import { resend } from "./client";
import SummaryEmail, { type SummaryEmailProps } from "../emails/summary";

const sendEmail = async ({
  to,
  subject,
  react,
  test,
  tags,
  unsubscribeToken,
}: {
  to: string;
  subject: string;
  react: ReactElement<any, string | JSXElementConstructor<any>>;
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
    from: "Inbox Zero <updates@transactional.getinboxzero.com>",
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
  to,
  test,
  emailProps,
}: {
  to: string;
  test?: boolean;
  emailProps: SummaryEmailProps;
}) => {
  sendEmail({
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
