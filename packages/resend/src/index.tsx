import { JSXElementConstructor, ReactElement } from "react";
import { Resend } from "resend";
import { nanoid } from "nanoid";
import StatsUpdateEmail, { StatsUpdateEmailProps } from "../emails/stats";

const resend = process.env.RESEND_API_KEY
  ? new Resend(process.env.RESEND_API_KEY)
  : null;

const sendEmail = async ({
  to,
  subject,
  react,
  test,
  listUnsubscribe,
  tags,
}: {
  to: string;
  subject: string;
  react: ReactElement<any, string | JSXElementConstructor<any>>;
  test?: boolean;
  listUnsubscribe?: boolean;
  entityRefId?: string;
  tags?: { name: string; value: string }[];
}) => {
  if (!resend) {
    console.log(
      "Resend is not configured. You need to add a RESEND_API_KEY in your .env file for emails to work.",
    );
    return Promise.resolve();
  }
  return resend.emails.send({
    from: "Elie from Inbox Zero <elie@getinboxzero.com>",
    to: test ? "delivered@resend.dev" : to,
    subject,
    react,
    headers: {
      ...(listUnsubscribe
        ? {
            "List-Unsubscribe": "<https://www.getinboxzero.com/settings>",
            // TODO From Feb 2024 Google requires this for bulk senders
            // "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
          }
        : {}),
      // Prevent threading on Gmail
      "X-Entity-Ref-ID": nanoid(),
    },
    tags,
  });
};

export const sendStatsEmail = async ({
  to,
  test,
  emailProps,
}: {
  to: string;
  test?: boolean;
  emailProps: StatsUpdateEmailProps;
}) => {
  sendEmail({
    to,
    subject: "Your weekly email stats",
    react: <StatsUpdateEmail {...emailProps} />,
    test,
    tags: [
      {
        name: "category",
        value: "stats",
      },
    ],
  });
};
