import type { Message } from "@microsoft/microsoft-graph-types";
import type { OutlookClient } from "@/utils/outlook/client";
import type { Attachment } from "nodemailer/lib/mailer";
import type { SendEmailBody } from "@/utils/gmail/mail";
import type { ParsedMessage } from "@/utils/types";
import type { EmailForAction } from "@/utils/ai/types";
import { createReplyContent } from "@/utils/gmail/reply";
import { forwardEmailHtml, forwardEmailSubject } from "@/utils/gmail/forward";
import { buildReplyAllRecipients } from "@/utils/email/reply-all";

interface OutlookMessageRequest {
  subject: string;
  body: {
    contentType: string;
    content: string;
  };
  toRecipients: { emailAddress: { address: string } }[];
  ccRecipients?: { emailAddress: { address: string } }[];
  bccRecipients?: { emailAddress: { address: string } }[];
  replyTo?: { emailAddress: { address: string } }[];
  conversationId?: string;
  isDraft?: boolean;
}

export async function sendEmailWithHtml(
  client: OutlookClient,
  body: SendEmailBody,
) {
  const message: OutlookMessageRequest = {
    subject: body.subject,
    body: {
      contentType: "html",
      content: body.messageHtml,
    },
    toRecipients: [{ emailAddress: { address: body.to } }],
    ...(body.cc
      ? { ccRecipients: [{ emailAddress: { address: body.cc } }] }
      : {}),
    ...(body.bcc
      ? { bccRecipients: [{ emailAddress: { address: body.bcc } }] }
      : {}),
    ...(body.replyTo
      ? { replyTo: [{ emailAddress: { address: body.replyTo } }] }
      : {}),
  };

  if (body.replyToEmail?.threadId) {
    message.conversationId = body.replyToEmail.threadId;
  }

  const result: Message = await client
    .getClient()
    .api("/me/messages")
    .post(message);
  return result;
}

export async function sendEmailWithPlainText(
  client: OutlookClient,
  body: Omit<SendEmailBody, "messageHtml"> & { messageText: string },
) {
  const messageHtml = convertTextToHtmlParagraphs(body.messageText);
  return sendEmailWithHtml(client, { ...body, messageHtml });
}

export async function replyToEmail(
  client: OutlookClient,
  message: EmailForAction,
  reply: string,
) {
  const { html } = createReplyContent({
    textContent: reply,
    message,
  });

  // Only replying to the original sender
  const replyMessage = {
    subject: `Re: ${message.headers.subject}`,
    body: {
      contentType: "html",
      content: html,
    },
    toRecipients: [
      {
        emailAddress: {
          address: message.headers["reply-to"] || message.headers.from,
        },
      },
    ],
    conversationId: message.threadId,
  };

  // Send the email immediately using the sendMail endpoint
  const result = await client.getClient().api("/me/sendMail").post({
    message: replyMessage,
    saveToSentItems: true,
  });
  return result;
}

export async function forwardEmail(
  client: OutlookClient,
  options: {
    messageId: string;
    to: string;
    cc?: string;
    bcc?: string;
    content?: string;
  },
) {
  if (!options.to.trim()) throw new Error("Recipient address is required");

  // Get the original message
  const originalMessage: Message = await client
    .getClient()
    .api(`/me/messages/${options.messageId}`)
    .get();

  const message: ParsedMessage = {
    id: originalMessage.id || "",
    threadId: originalMessage.conversationId || "",
    snippet: originalMessage.bodyPreview || "",
    textPlain: originalMessage.body?.content || "",
    textHtml: originalMessage.body?.content || "",
    headers: {
      from: originalMessage.from?.emailAddress?.address || "",
      to: originalMessage.toRecipients?.[0]?.emailAddress?.address || "",
      subject: originalMessage.subject || "",
      date: originalMessage.receivedDateTime || new Date().toISOString(),
    },
    historyId: "",
    inline: [],
    internalDate: originalMessage.receivedDateTime || new Date().toISOString(),
    subject: originalMessage.subject || "",
    date: originalMessage.receivedDateTime || new Date().toISOString(),
    conversationIndex: originalMessage.conversationId || "",
  };

  const forwardMessage: OutlookMessageRequest = {
    toRecipients: [{ emailAddress: { address: options.to } }],
    ...(options.cc
      ? { ccRecipients: [{ emailAddress: { address: options.cc } }] }
      : {}),
    ...(options.bcc
      ? { bccRecipients: [{ emailAddress: { address: options.bcc } }] }
      : {}),
    subject: forwardEmailSubject(message.headers.subject),
    body: {
      contentType: "html",
      content: forwardEmailHtml({ content: options.content ?? "", message }),
    },
  };

  const result = await client
    .getClient()
    .api(`/me/messages/${options.messageId}/forward`)
    .post({ message: forwardMessage });

  return result;
}

export async function draftEmail(
  client: OutlookClient,
  originalEmail: EmailForAction,
  args: {
    to?: string;
    subject?: string;
    content: string;
    attachments?: Attachment[];
  },
  userEmail: string,
) {
  const { html } = createReplyContent({
    textContent: args.content,
    message: originalEmail,
  });

  const recipients = buildReplyAllRecipients(
    originalEmail.headers,
    args.to,
    userEmail,
  );

  // Convert CC addresses to Outlook format
  const ccRecipients = recipients.cc.map((addr) => ({
    emailAddress: { address: addr },
  }));

  // Use createReply endpoint to create a proper reply draft
  // This ensures the draft is linked to the original message as a reply
  const replyDraft: Message = await client
    .getClient()
    .api(`/me/messages/${originalEmail.id}/createReply`)
    .post({});

  // Update the draft with our content
  const updatedDraft: Message = await client
    .getClient()
    .api(`/me/messages/${replyDraft.id}`)
    .patch({
      subject: args.subject || originalEmail.headers.subject,
      body: {
        contentType: "html",
        content: html,
      },
      toRecipients: [
        {
          emailAddress: {
            address: recipients.to,
          },
        },
      ],
      ...(ccRecipients.length > 0 ? { ccRecipients } : {}),
    });

  // Use the original replyDraft.id since that's the stable ID
  // The PATCH response might not always include the full object?
  return { ...updatedDraft, id: replyDraft.id };
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
