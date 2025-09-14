import { z } from "zod";
import type { gmail_v1 } from "@googleapis/gmail";
import MailComposer from "nodemailer/lib/mail-composer";
import type Mail from "nodemailer/lib/mailer";
import type { Attachment } from "nodemailer/lib/mailer";
import { zodAttachment } from "@/utils/types/mail";
import { convertEmailHtmlToText } from "@/utils/mail";
import { parseMessage } from "@/utils/gmail/message";
import { getMessage } from "@/utils/gmail/message";
import {
  forwardEmailHtml,
  forwardEmailSubject,
  forwardEmailText,
} from "@/utils/gmail/forward";
import type { ParsedMessage } from "@/utils/types";
import { createReplyContent } from "@/utils/gmail/reply";
import type { EmailForAction } from "@/utils/ai/types";
import { createScopedLogger } from "@/utils/logger";
import { withGmailRetry } from "@/utils/gmail/retry";
import { buildReplyAllRecipients, formatCcList } from "@/utils/email/reply-all";

const logger = createScopedLogger("gmail/mail");

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
  messageHtml: z.string(),
  attachments: z.array(zodAttachment).optional(),
});
export type SendEmailBody = z.infer<typeof sendEmailBody>;

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
  {
    to,
    cc,
    bcc,
    subject,
    messageHtml,
    messageText,
    attachments,
    replyToEmail,
  }: Omit<SendEmailBody, "attachments"> & {
    attachments?: Attachment[];
    messageText: string;
  },
  from?: string,
) => {
  return await createMail({
    from,
    to,
    cc,
    bcc,
    subject,
    alternatives: [
      {
        contentType: "text/plain; charset=UTF-8",
        content: messageText,
      },
      {
        contentType: "text/html; charset=UTF-8",
        content: messageHtml,
      },
    ],
    attachments,
    // https://datatracker.ietf.org/doc/html/rfc2822#appendix-A.2
    references: replyToEmail
      ? `${replyToEmail.references || ""} ${replyToEmail.headerMessageId}`.trim()
      : "",
    inReplyTo: replyToEmail ? replyToEmail.headerMessageId : "",
    headers: {
      "X-Mailer": "Inbox Zero Web",
    },
  });
};

// https://developers.google.com/gmail/api/guides/sending
// https://www.labnol.org/google-api-service-account-220405
export async function sendEmailWithHtml(
  gmail: gmail_v1.Gmail,
  body: SendEmailBody,
) {
  let messageText: string;

  try {
    messageText = convertEmailHtmlToText({ htmlText: body.messageHtml });
  } catch (error) {
    logger.error("Error converting email html to text", { error });
    // Strip HTML tags as a fallback
    messageText = body.messageHtml.replace(/<[^>]*>/g, "");
  }

  const raw = await createRawMailMessage({ ...body, messageText });
  const result = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      threadId: body.replyToEmail ? body.replyToEmail.threadId : undefined,
      raw,
    },
  });
  return result;
}

export async function sendEmailWithPlainText(
  gmail: gmail_v1.Gmail,
  body: Omit<SendEmailBody, "messageHtml"> & { messageText: string },
) {
  const messageHtml = convertTextToHtmlParagraphs(body.messageText);
  return sendEmailWithHtml(gmail, { ...body, messageHtml });
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
    textContent: reply,
    message,
  });

  // Use reply-all logic to build recipients
  const recipients = buildReplyAllRecipients(message.headers);

  const raw = await createRawMailMessage(
    {
      to: recipients.to,
      cc: formatCcList(recipients.cc),
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

  const result = await gmail.users.messages.send({
    userId: "me",
    requestBody: {
      threadId: message.threadId,
      raw,
    },
  });

  return result;
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

  // TODO: Use email provider to get the message which will parse it internally
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

// Handles both replies and regular drafts. May want to split that out into two functions
export async function draftEmail(
  gmail: gmail_v1.Gmail,
  originalEmail: EmailForAction,
  args: {
    to?: string;
    subject?: string;
    content: string;
    attachments?: Attachment[];
  },
) {
  const { text, html } = createReplyContent({
    textContent: args.content,
    message: originalEmail,
  });

  // Use reply-all logic to build recipients
  const recipients = buildReplyAllRecipients(originalEmail.headers, args.to);

  const raw = await createRawMailMessage({
    to: recipients.to,
    cc: formatCcList(recipients.cc),
    bcc: originalEmail.headers.bcc,
    subject: args.subject || originalEmail.headers.subject,
    messageHtml: html,
    messageText: text,
    attachments: args.attachments,
    replyToEmail: {
      threadId: originalEmail.threadId,
      headerMessageId: originalEmail.headers["message-id"] || "",
      references: originalEmail.headers.references,
    },
  });

  const result = await createDraft(gmail, originalEmail.threadId, raw);

  return result;
}

async function createDraft(
  gmail: gmail_v1.Gmail,
  threadId: string,
  raw: string,
) {
  const result = await withGmailRetry(async () =>
    gmail.users.drafts.create({
      userId: "me",
      requestBody: {
        message: {
          threadId,
          raw,
        },
      },
    }),
  );

  return result;
}

function convertTextToHtmlParagraphs(text?: string | null): string {
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
}
