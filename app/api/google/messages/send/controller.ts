import { z } from "zod";
import MailComposer from "nodemailer/lib/mail-composer";
import Mail from "nodemailer/lib/mailer";
import { gmail_v1 } from "googleapis";

export const sendEmailBody = z.object({
  threadId: z.string().optional(),
  to: z.string(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  replyTo: z.string().optional(),
  subject: z.string(),
  message: z.string(),
});
export type SendEmailBody = z.infer<typeof sendEmailBody>;
export type SendEmailResponse = Awaited<ReturnType<typeof sendEmail>>;

const encodeMessage = (message: Buffer) => {
  return Buffer.from(message)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
};

const createMail = async (options: Mail.Options) => {
  const mailComposer = new MailComposer(options);
  const message = await mailComposer.compile().build();
  return encodeMessage(message);
};

// https://developers.google.com/gmail/api/guides/sending
// https://www.labnol.org/google-api-service-account-220405
export async function sendEmail(gmail: gmail_v1.Gmail, body: SendEmailBody) {
  const rawMessage = await createMail({
    // references: {
    //   'In-Reply-To': body.replyTo || body.to,
    // },
    to: body.to,
    cc: body.cc,
    bcc: body.bcc,
    replyTo: body.replyTo || body.to,
    subject: body.subject,
    text: body.message,
    // html: ``,
    // attachments: fileAttachments,
    textEncoding: "base64",
    // TODO
    // https://datatracker.ietf.org/doc/html/rfc2822#appendix-A.2
    // headers: [
    //   {
    //     key: 'In-Reply-To',
    //     value: body.inReplyTo
    //   },
    //   {
    //     key: 'References',
    //     value: body.references + ' ' + body.inReplyTo
    //   }
    // ],
  });

  const result = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      threadId: body.threadId,
      raw: rawMessage,
    },
  });

  return result;
}
