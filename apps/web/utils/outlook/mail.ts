import type { Message } from "@microsoft/microsoft-graph-types";
import type { OutlookClient } from "@/utils/outlook/client";
import type { Attachment } from "nodemailer/lib/mailer";
import type { SendEmailBody } from "@/utils/gmail/mail";
import type { ParsedMessage } from "@/utils/types";
import type { EmailForAction } from "@/utils/ai/types";
import { createOutlookReplyContent } from "@/utils/outlook/reply";
import { forwardEmailHtml, forwardEmailSubject } from "@/utils/gmail/forward";
import {
  buildReplyAllRecipients,
  mergeAndDedupeRecipients,
} from "@/utils/email/reply-all";
import { formatReplySubject } from "@/utils/email/subject";
import { buildThreadingHeaders } from "@/utils/email/threading";
import { withOutlookRetry } from "@/utils/outlook/retry";
import { extractEmailAddress, extractNameFromEmail } from "@/utils/email";
import { ensureEmailSendingEnabled } from "@/utils/mail";
import type { Logger } from "@/utils/logger";

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
  internetMessageHeaders?: { name: string; value: string }[];
  isDraft?: boolean;
}

type SentEmailResult = Pick<Message, "id" | "conversationId">;

export async function sendEmailWithHtml(
  client: OutlookClient,
  body: SendEmailBody,
  logger: Logger,
): Promise<SentEmailResult> {
  ensureEmailSendingEnabled();

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

  if (body.replyToEmail) {
    message.conversationId = body.replyToEmail.threadId;

    // Set In-Reply-To and References headers for proper threading
    // Microsoft uses these headers (not conversationId) to determine thread membership
    if (body.replyToEmail.headerMessageId) {
      const headers = buildThreadingHeaders({
        headerMessageId: body.replyToEmail.headerMessageId,
        references: body.replyToEmail.references,
      });
      message.internetMessageHeaders = [
        { name: "In-Reply-To", value: headers.inReplyTo },
        { name: "References", value: headers.references },
      ];
    }
  }

  await withOutlookRetry(
    () =>
      client.getClient().api("/me/sendMail").post({
        message,
        saveToSentItems: true,
      }),
    logger,
  );

  // /me/sendMail returns 202 with no body, so we can't get the sent message ID.
  // Graph doesn't support filtering by internetMessageHeaders, so we can't query for it.
  // Thread continuity is maintained via In-Reply-To/References headers set above.
  // Empty id means auto-expand won't work in EmailThread, but we don't show that for Outlook.
  return {
    id: "",
    conversationId: message.conversationId,
  };
}

export async function sendEmailWithPlainText(
  client: OutlookClient,
  body: Omit<SendEmailBody, "messageHtml"> & { messageText: string },
  logger: Logger,
) {
  const messageHtml = convertTextToHtmlParagraphs(body.messageText);
  return sendEmailWithHtml(client, { ...body, messageHtml }, logger);
}

export async function replyToEmail(
  client: OutlookClient,
  message: EmailForAction,
  reply: string,
  logger: Logger,
) {
  const { html } = createOutlookReplyContent({
    textContent: reply,
    message,
  });

  const headerMessageId = message.headers["message-id"];

  // Only replying to the original sender
  const replyMessage: OutlookMessageRequest = {
    subject: formatReplySubject(message.headers.subject),
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
    // Set In-Reply-To and References headers for proper threading
    ...(headerMessageId && {
      internetMessageHeaders: (() => {
        const headers = buildThreadingHeaders({
          headerMessageId,
          references: message.headers.references,
        });
        return [
          { name: "In-Reply-To", value: headers.inReplyTo },
          { name: "References", value: headers.references },
        ];
      })(),
    }),
  };

  ensureEmailSendingEnabled();

  // Send the email immediately using the sendMail endpoint
  const result = await withOutlookRetry(
    () =>
      client.getClient().api("/me/sendMail").post({
        message: replyMessage,
        saveToSentItems: true,
      }),
    logger,
  );
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
  logger: Logger,
) {
  ensureEmailSendingEnabled();

  if (!options.to.trim()) throw new Error("Recipient address is required");

  // Get the original message
  const originalMessage: Message = await withOutlookRetry(
    () => client.getClient().api(`/me/messages/${options.messageId}`).get(),
    logger,
  );

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

  const result = await withOutlookRetry(
    () =>
      client
        .getClient()
        .api(`/me/messages/${options.messageId}/forward`)
        .post({ message: forwardMessage }),
    logger,
  );

  return result;
}

export async function draftEmail(
  client: OutlookClient,
  originalEmail: EmailForAction,
  args: {
    to?: string;
    subject?: string;
    content: string;
    cc?: string;
    bcc?: string;
    attachments?: Attachment[];
  },
  userEmail: string,
  logger: Logger,
) {
  const { html } = createOutlookReplyContent({
    textContent: args.content,
    message: originalEmail,
  });

  const recipients = buildReplyAllRecipients(
    originalEmail.headers,
    args.to,
    userEmail,
  );

  // Use raw recipients if available (Outlook), otherwise parse from string (Gmail)
  const toRecipient = originalEmail.rawRecipients?.from || {
    emailAddress: {
      address: extractEmailAddress(recipients.to),
      name: extractNameFromEmail(recipients.to),
    },
  };

  // Build CC list from reply-all and args
  const ccAddresses = mergeAndDedupeRecipients(recipients.cc, args.cc);

  // Convert CC addresses to Outlook format
  const ccRecipients = ccAddresses.map((addr) => ({
    emailAddress: {
      address: extractEmailAddress(addr),
      name: extractNameFromEmail(addr),
    },
  }));

  // Handle BCC if provided
  const bccAddresses = mergeAndDedupeRecipients([], args.bcc);
  const bccRecipients = bccAddresses.map((addr) => ({
    emailAddress: {
      address: extractEmailAddress(addr),
      name: extractNameFromEmail(addr),
    },
  }));

  // Get the original message's isRead status before creating the draft
  // Microsoft Graph's createReplyAll automatically marks the original as read
  const originalMessage: Message = await withOutlookRetry(
    () =>
      client
        .getClient()
        .api(`/me/messages/${originalEmail.id}`)
        .select("isRead")
        .get(),
    logger,
  );
  const wasUnread = originalMessage.isRead === false;

  // Use createReplyAll endpoint to create a proper reply draft
  // This ensures the draft is linked to the original message as a reply all
  const replyDraft: Message = await withOutlookRetry(
    () =>
      client
        .getClient()
        .api(`/me/messages/${originalEmail.id}/createReplyAll`)
        .post({}),
    logger,
  );

  // Update the draft with our content
  const updateRequest = client.getClient().api(`/me/messages/${replyDraft.id}`);

  // To handle change key error
  const etag = (replyDraft as { "@odata.etag"?: string })?.["@odata.etag"];
  if (etag) {
    updateRequest.header("If-Match", etag);
  }

  const updatedDraft: Message = await withOutlookRetry(
    () =>
      updateRequest.patch({
        subject: args.subject || originalEmail.headers.subject,
        body: {
          contentType: "html",
          content: html,
        },
        toRecipients: [toRecipient],
        ...(ccRecipients.length > 0 ? { ccRecipients } : {}),
        ...(bccRecipients.length > 0 ? { bccRecipients } : {}),
      }),
    logger,
  );

  // Restore the original message's unread status if it was unread before
  // createReplyAll automatically marks the original message as read
  if (wasUnread) {
    await withOutlookRetry(
      () =>
        client
          .getClient()
          .api(`/me/messages/${originalEmail.id}`)
          .patch({ isRead: false }),
      logger,
    );
  }

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
