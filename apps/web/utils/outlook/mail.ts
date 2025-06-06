import { z } from "zod";
import type { Attachment as NodemailerAttachment } from "nodemailer/lib/mailer";
import { zodAttachment } from "@/utils/types/mail";
import { convertEmailHtmlToText } from "@/utils/mail";
import { createScopedLogger } from "@/utils/logger";

const logger = createScopedLogger("outlook/mail");

export const sendEmailBody = z.object({
  replyToEmail: z
    .object({
      threadId: z.string(),
      headerMessageId: z.string(),
      references: z.string().optional(),
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

/**
 * Converts nodemailer-style attachments to Microsoft Graph format.
 */
function toGraphAttachments(attachments?: NodemailerAttachment[]) {
  if (!attachments) return [];
  return attachments.map((a) => ({
    "@odata.type": "#microsoft.graph.fileAttachment",
    name: a.filename,
    contentType: a.contentType,
    contentBytes: a.content?.toString("base64"),
  }));
}

/**
 * Send an email with HTML content using Microsoft Graph.
 */
export async function sendEmailWithHtmlGraph(
  graphClient: any,
  body: SendEmailBody,
  from?: string,
) {
  let messageText: string;

  try {
    messageText = convertEmailHtmlToText({ htmlText: body.messageHtml });
  } catch (error) {
    logger.error("Error converting email html to text", { error });
    messageText = body.messageHtml.replace(/<[^>]*>/g, "");
  }

  const message: any = {
    subject: body.subject,
    body: {
      contentType: "HTML",
      content: body.messageHtml,
    },
    toRecipients: body.to
      .split(",")
      .map((email) => ({ emailAddress: { address: email.trim() } })),
    ccRecipients: body.cc
      ? body.cc
          .split(",")
          .map((email) => ({ emailAddress: { address: email.trim() } }))
      : [],
    bccRecipients: body.bcc
      ? body.bcc
          .split(",")
          .map((email) => ({ emailAddress: { address: email.trim() } }))
      : [],
    attachments: toGraphAttachments(body.attachments),
  };

  if (body.replyTo) {
    message.replyTo = [{ emailAddress: { address: body.replyTo } }];
  }

  // Optionally set "from" if sending as another user (requires permissions)
  if (from) {
    message.from = { emailAddress: { address: from } };
  }

  // Send the message
  await graphClient
    .api("/me/sendMail")
    .post({ message, saveToSentItems: true });
  return { success: true };
}
