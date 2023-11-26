import { z } from "zod";
import { gmail_v1 } from "googleapis";
import MailComposer from "nodemailer/lib/mail-composer";
import Mail from "nodemailer/lib/mailer";

export const sendEmailBody = z.object({
  replyToEmail: z
    .object({
      threadId: z.string(),
      headerMessageId: z.string(), // this is different to the gmail message id and looks something like <123...abc@mail.example.com>
      references: z.string().optional(), // for threading
    })
    .optional(),
  to: z.string(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  replyTo: z.string().optional(),
  subject: z.string(),
  messageText: z.string(),
  messageHtml: z.string().optional(),
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

const createRawMailMessage = async (body: SendEmailBody) => {
  return await createMail({
    to: body.to,
    cc: body.cc,
    bcc: body.bcc,
    subject: body.subject,
    text: body.messageText,
    html: body.messageHtml,
    // attachments: fileAttachments,
    textEncoding: "base64",
    // https://datatracker.ietf.org/doc/html/rfc2822#appendix-A.2
    references: body.replyToEmail
      ? `${body.replyToEmail.references || ""} ${
          body.replyToEmail.headerMessageId
        }`.trim()
      : "",
    inReplyTo: body.replyToEmail ? body.replyToEmail.headerMessageId : "",
    headers: {
      "X-Mailer": "Inbox Zero Web",
    },
  });
};

// https://developers.google.com/gmail/api/guides/sending
// https://www.labnol.org/google-api-service-account-220405
export async function sendEmail(gmail: gmail_v1.Gmail, body: SendEmailBody) {
  const raw = await createRawMailMessage(body);

  const result = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      threadId: body.replyToEmail ? body.replyToEmail.threadId : undefined,
      raw,
    },
  });

  return result;
}

export async function draftEmail(gmail: gmail_v1.Gmail, body: SendEmailBody) {
  const raw = await createRawMailMessage(body);

  const result = await gmail.users.drafts.create({
    userId: "me",
    requestBody: {
      message: {
        threadId: body.replyToEmail ? body.replyToEmail.threadId : "",
        raw,
      },
    },
  });

  return result;
}
