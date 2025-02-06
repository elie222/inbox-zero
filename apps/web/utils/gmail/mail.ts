import { z } from "zod";
import type { gmail_v1 } from "@googleapis/gmail";
import MailComposer from "nodemailer/lib/mail-composer";
import type Mail from "nodemailer/lib/mailer";
import type { Attachment } from "nodemailer/lib/mailer";
import { zodAttachment } from "@/utils/types/mail";
import { parseMessage } from "@/utils/mail";
import { getMessage } from "@/utils/gmail/message";
import {
  forwardEmailHtml,
  forwardEmailSubject,
  forwardEmailText,
} from "@/utils/gmail/forward";
import type { ParsedMessage } from "@/utils/types";
import { createReplyContent } from "@/utils/gmail/reply";

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
  attachments: z.array(zodAttachment).optional(),
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

const createRawMailMessage = async (
  body: Omit<SendEmailBody, "attachments"> & { attachments?: Attachment[] },
  from?: string,
) => {
  return await createMail({
    from,
    to: body.to,
    cc: body.cc,
    bcc: body.bcc,
    subject: body.subject,
    alternatives: [
      {
        contentType: "text/plain; charset=UTF-8",
        content: body.messageText,
      },
      {
        contentType: "text/html; charset=UTF-8",
        content:
          body.messageHtml || convertTextToHtmlParagraphs(body.messageText),
      },
    ],
    attachments: body.attachments,
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
export async function sendEmail(
  gmail: gmail_v1.Gmail,
  body: SendEmailBody,
  from?: string,
) {
  const raw = await createRawMailMessage(body, from);

  const result = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      threadId: body.replyToEmail ? body.replyToEmail.threadId : undefined,
      raw,
    },
  });

  return result;
}

export async function replyToEmail(
  gmail: gmail_v1.Gmail,
  message: Pick<
    ParsedMessage,
    "threadId" | "headers" | "textPlain" | "textHtml"
  >,
  reply: string,
  from?: string,
) {
  const { text, html } = createReplyContent({
    content: reply,
    message,
  });

  return sendEmail(
    gmail,
    {
      to: message.headers["reply-to"] || message.headers.from,
      subject: message.headers.subject,
      messageText: text,
      messageHtml: html,
      replyToEmail: {
        threadId: message.threadId,
        headerMessageId: message.headers["message-id"] || "",
        references: message.headers.references,
      },
    },
    from,
  );
}

function detectTextDirection(text: string): "ltr" | "rtl" {
  // Basic RTL detection - checks for RTL characters at the start of the text
  const rtlRegex =
    /[\u0591-\u07FF\u200F\u202B\u202E\uFB1D-\uFDFD\uFE70-\uFEFC]/;
  return rtlRegex.test(text.trim().charAt(0)) ? "rtl" : "ltr";
}

function formatEmailDate(date: Date): string {
  return date.toLocaleString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "numeric",
    hour12: true,
  });
}

export async function forwardEmail(
  gmail: gmail_v1.Gmail,
  options: {
    messageId: string;
    to: string;
    cc?: string;
    bcc?: string;
    content?: string;
  },
) {
  if (!options.to.trim()) throw new Error("Recipient address is required");

  const m = await getMessage(options.messageId, gmail);

  const messageId = m.id;
  if (!messageId) throw new Error("Message not found");

  const message = parseMessage(m);

  const attachments = await Promise.all(
    message.attachments?.map(async (attachment) => {
      const attachmentData = await gmail.users.messages.attachments.get({
        userId: "me",
        messageId,
        id: attachment.attachmentId,
      });
      return {
        content: Buffer.from(attachmentData.data.data || "", "base64"),
        contentType: attachment.mimeType,
        filename: attachment.filename,
      };
    }) || [],
  );

  const raw = await createRawMailMessage({
    to: options.to,
    cc: options.cc,
    bcc: options.bcc,
    subject: forwardEmailSubject(message.headers.subject),
    messageText: forwardEmailText({ content: options.content ?? "", message }),
    messageHtml: forwardEmailHtml({ content: options.content ?? "", message }),
    replyToEmail: {
      threadId: message.threadId || "",
      references: "",
      headerMessageId: "",
    },
    attachments,
  });

  const result = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      threadId: message.threadId,
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

const convertTextToHtmlParagraphs = (text?: string | null): string => {
  if (!text) return "";

  // Split the text into paragraphs based on newline characters
  const paragraphs = text
    .split("\n")
    .filter((paragraph) => paragraph.trim() !== "");

  // Wrap each paragraph with <p> tags and join them back together
  const htmlContent = paragraphs
    .map((paragraph) => `<p>${paragraph.trim()}</p>`)
    .join("");

  return `<html><body>${htmlContent}</body></html>`;
};
