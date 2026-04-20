import type { Message } from "@microsoft/microsoft-graph-types";
import type { OutlookClient } from "@/utils/outlook/client";
import type { Attachment } from "nodemailer/lib/mailer";
import type { SendEmailBody } from "@/utils/gmail/mail";
import type { WithMailerAttachments } from "@/utils/types/mail";
import type { ParsedMessage } from "@/utils/types";
import type { EmailForAction } from "@/utils/ai/types";
import { createOutlookReplyContent } from "@/utils/outlook/reply";
import { escapeHtml } from "@/utils/string";
import { forwardEmailHtml, forwardEmailSubject } from "@/utils/gmail/forward";
import {
  buildReplyAllRecipients,
  mergeAndDedupeRecipients,
} from "@/utils/email/reply-all";
import { withOutlookRetry } from "@/utils/outlook/retry";
import { extractEmailAddress, extractNameFromEmail } from "@/utils/email";
import { ensureEmailSendingEnabled } from "@/utils/mail";
import type { Logger } from "@/utils/logger";

type GraphRecipient = {
  emailAddress: { address: string; name?: string };
};
type MailSendEmailBody = WithMailerAttachments<SendEmailBody>;

const MAX_GRAPH_ATTACHMENT_SIZE_BYTES = 3 * 1024 * 1024;
const MAX_GRAPH_UPLOAD_SESSION_SIZE_BYTES = 150 * 1024 * 1024;
const GRAPH_UPLOAD_CHUNK_SIZE_BYTES = 320 * 1024;

type SentEmailResult = Pick<Message, "id" | "conversationId">;

export async function sendEmailWithHtml(
  client: OutlookClient,
  body: MailSendEmailBody,
  logger: Logger,
): Promise<SentEmailResult> {
  ensureEmailSendingEnabled();

  // For replies with a message ID, use createReply for proper threading
  // Microsoft Graph's sendMail doesn't support In-Reply-To/References headers
  if (body.replyToEmail?.messageId) {
    return sendReplyUsingCreateReply(client, body, logger);
  }

  const toRecipients = buildGraphRecipients(body.to);
  if (!toRecipients?.length) throw new Error("Recipient address is required");
  const ccRecipients = buildGraphRecipients(body.cc);
  const bccRecipients = buildGraphRecipients(body.bcc);
  const replyToRecipients = buildGraphRecipients(body.replyTo);

  // For new emails, create draft then send to get the conversationId.
  // sendMail returns 202 with no body, so we use the draft approach instead.
  const draft: Message = await withOutlookRetry(
    () =>
      client
        .getClient()
        .api("/me/messages")
        .post({
          subject: body.subject,
          body: {
            contentType: "html",
            content: body.messageHtml,
          },
          toRecipients,
          ...(ccRecipients ? { ccRecipients } : {}),
          ...(bccRecipients ? { bccRecipients } : {}),
          ...(replyToRecipients ? { replyTo: replyToRecipients } : {}),
        }),
    logger,
  );

  if (body.attachments?.length) {
    await addAttachmentsToDraft({
      client,
      draftId: draft.id || "",
      attachments: body.attachments,
      logger,
    });
  }

  await withOutlookRetry(
    () => client.getClient().api(`/me/messages/${draft.id}/send`).post({}),
    logger,
  );

  // Draft id is no longer valid after sending; Graph doesn't return sent message id
  return {
    id: "",
    conversationId: draft.conversationId,
  };
}

export async function sendEmailWithPlainText(
  client: OutlookClient,
  body: Omit<MailSendEmailBody, "messageHtml"> & { messageText: string },
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
  options?: { replyTo?: string; from?: string; attachments?: Attachment[] },
) {
  ensureEmailSendingEnabled();

  const { html } = createOutlookReplyContent({
    textContent: reply,
    message,
  });

  // Use createReply to create a properly threaded draft
  // Microsoft Graph's sendMail doesn't support setting In-Reply-To/References headers
  // Only createReply/createReplyAll endpoints ensure proper threading
  const replyDraft: Message = await withOutlookRetry(
    () =>
      client.getClient().api(`/me/messages/${message.id}/createReply`).post({}),
    logger,
  );

  const fromField = buildGraphFromField(
    options?.from,
    replyDraft.from?.emailAddress?.address,
  );

  // Update the draft with our content
  await withOutlookRetry(
    () =>
      client
        .getClient()
        .api(`/me/messages/${replyDraft.id}`)
        .patch({
          body: {
            contentType: "html",
            content: html,
          },
          ...(fromField ? { from: fromField } : {}),
          ...(options?.replyTo
            ? {
                replyTo: [{ emailAddress: { address: options.replyTo } }],
              }
            : {}),
        }),
    logger,
  );

  if (options?.attachments?.length) {
    await addAttachmentsToDraft({
      client,
      draftId: replyDraft.id || "",
      attachments: options.attachments,
      logger,
    });
  }

  // Send the draft
  await withOutlookRetry(
    () => client.getClient().api(`/me/messages/${replyDraft.id}/send`).post({}),
    logger,
  );

  // Draft ID is no longer valid after /send; Graph doesn't return sent message ID
  return {
    id: "",
    conversationId: replyDraft.conversationId,
  };
}

export async function forwardEmail(
  client: OutlookClient,
  options: {
    messageId: string;
    to: string;
    cc?: string;
    bcc?: string;
    content?: string;
    from?: string;
  },
  logger: Logger,
) {
  ensureEmailSendingEnabled();

  if (!options.to.trim()) throw new Error("Recipient address is required");

  const toRecipients = buildGraphRecipients(options.to);
  if (!toRecipients?.length) throw new Error("Recipient address is required");
  const ccRecipients = buildGraphRecipients(options.cc);
  const bccRecipients = buildGraphRecipients(options.bcc);

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

  const forwardDraft: Message = await withOutlookRetry(
    () =>
      client
        .getClient()
        .api(`/me/messages/${options.messageId}/createForward`)
        .post({}),
    logger,
  );

  const fromField = buildGraphFromField(
    options.from,
    forwardDraft.from?.emailAddress?.address,
  );

  await withOutlookRetry(
    () =>
      client
        .getClient()
        .api(`/me/messages/${forwardDraft.id}`)
        .patch({
          toRecipients,
          ...(ccRecipients ? { ccRecipients } : {}),
          ...(bccRecipients ? { bccRecipients } : {}),
          ...(fromField ? { from: fromField } : {}),
          subject: forwardEmailSubject(message.headers.subject),
          body: {
            contentType: "html",
            content: forwardEmailHtml({
              content: options.content ?? "",
              message,
            }),
          },
        }),
    logger,
  );

  await withOutlookRetry(
    () =>
      client.getClient().api(`/me/messages/${forwardDraft.id}/send`).post({}),
    logger,
  );

  return {
    id: "",
    conversationId: forwardDraft.conversationId,
  };
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

  if (args.attachments?.length) {
    await addAttachmentsToDraft({
      client,
      draftId: replyDraft.id || updatedDraft.id || "",
      attachments: args.attachments,
      logger,
    });
  }

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
  // Escape HTML to prevent prompt injection attacks
  const htmlContent = paragraphs
    .map((paragraph) => `<p>${escapeHtml(paragraph.trim())}</p>`)
    .join("");

  return `<html><body>${htmlContent}</body></html>`;
}

async function sendReplyUsingCreateReply(
  client: OutlookClient,
  body: MailSendEmailBody,
  logger: Logger,
): Promise<SentEmailResult> {
  const originalMessageId = body.replyToEmail!.messageId!;

  // Use createReply to create a properly threaded draft
  // Microsoft Graph's createReply automatically sets In-Reply-To and References headers
  // based on the original message, ensuring proper threading across email providers
  const replyDraft: Message = await withOutlookRetry(
    () =>
      client
        .getClient()
        .api(`/me/messages/${originalMessageId}/createReply`)
        .post({}),
    logger,
  );

  // Update the draft with our content and recipients
  // Note: We cannot set In-Reply-To/References headers via internetMessageHeaders
  // as Microsoft Graph only allows custom headers (starting with x-) there.
  // The createReply endpoint handles standard threading headers automatically.
  await withOutlookRetry(
    () =>
      client
        .getClient()
        .api(`/me/messages/${replyDraft.id}`)
        .patch({
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
        }),
    logger,
  );

  if (body.attachments?.length) {
    await addAttachmentsToDraft({
      client,
      draftId: replyDraft.id || "",
      attachments: body.attachments,
      logger,
    });
  }

  // Send the draft
  await withOutlookRetry(
    () => client.getClient().api(`/me/messages/${replyDraft.id}/send`).post({}),
    logger,
  );

  // Draft ID is no longer valid after /send; Graph doesn't return sent message ID
  return {
    id: "",
    conversationId: replyDraft.conversationId,
  };
}

function buildGraphRecipients(
  recipientList?: string,
): GraphRecipient[] | undefined {
  if (!recipientList) return undefined;

  const parts = recipientList.split(/,(?=(?:[^"]*"[^"]*")*[^"]*$)/);
  const recipients = parts
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part): GraphRecipient | null => {
      const address = extractEmailAddress(part);
      if (!address) return null;

      const name = extractNameFromEmail(part).trim();
      return {
        emailAddress: {
          address,
          ...(name && name !== address ? { name } : {}),
        },
      };
    })
    .filter((recipient): recipient is GraphRecipient => recipient !== null);

  if (!recipients.length) return undefined;

  const seen = new Set<string>();
  return recipients.filter((recipient) => {
    const key = recipient.emailAddress.address.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildGraphFromField(
  formattedFrom?: string,
  fallbackAddress?: string | null,
) {
  if (!formattedFrom) return undefined;

  const address = extractEmailAddress(formattedFrom) || fallbackAddress;
  if (!address) return undefined;

  const name = extractNameFromEmail(formattedFrom).trim();

  return {
    emailAddress: {
      address,
      ...(name && name !== address ? { name } : {}),
    },
  };
}

async function addAttachmentsToDraft({
  client,
  draftId,
  attachments,
  logger,
}: {
  client: OutlookClient;
  draftId: string;
  attachments: Attachment[];
  logger: Logger;
}) {
  if (!draftId) return;

  for (const attachment of attachments) {
    const result = getAttachmentContent(attachment.content);
    if (!result) continue;
    const { buffer, base64 } = result;
    if (buffer.length <= MAX_GRAPH_ATTACHMENT_SIZE_BYTES) {
      await withOutlookRetry(
        () =>
          client
            .getClient()
            .api(`/me/messages/${draftId}/attachments`)
            .post({
              "@odata.type": "#microsoft.graph.fileAttachment",
              name: attachment.filename || "attachment.pdf",
              contentType: attachment.contentType || "application/octet-stream",
              contentBytes: base64 ?? buffer.toString("base64"),
            }),
        logger,
      );
      continue;
    }

    assertGraphAttachmentSizeSupported({ attachment, content: buffer });
    await uploadAttachmentViaSession({
      client,
      draftId,
      attachment,
      content: buffer,
      logger,
    });
  }
}

function getAttachmentContent(
  content: Attachment["content"],
): { buffer: Buffer; base64: string | null } | null {
  if (Buffer.isBuffer(content)) return { buffer: content, base64: null };
  if (typeof content === "string") return decodeAttachmentString(content);
  return null;
}

function assertGraphAttachmentSizeSupported({
  attachment,
  content,
}: {
  attachment: Attachment;
  content: Buffer;
}) {
  if (content.length <= MAX_GRAPH_UPLOAD_SESSION_SIZE_BYTES) return;

  throw new Error(
    `Outlook attachments larger than 150 MB are not supported: ${
      attachment.filename || "attachment"
    }`,
  );
}

function decodeAttachmentString(content: string): {
  buffer: Buffer;
  base64: string | null;
} {
  const normalized = content.trim().replace(/\s+/g, "");
  if (looksLikeBase64(normalized)) {
    const decoded = Buffer.from(normalized, "base64");
    if (isCanonicalBase64Match(normalized, decoded)) {
      return { buffer: decoded, base64: normalized };
    }
  }

  return { buffer: Buffer.from(content, "utf8"), base64: null };
}

function looksLikeBase64(value: string) {
  return value.length > 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(value);
}

function isCanonicalBase64Match(value: string, decoded: Buffer) {
  return (
    decoded.toString("base64").replace(/=+$/u, "") === value.replace(/=+$/u, "")
  );
}

async function uploadAttachmentViaSession({
  client,
  draftId,
  attachment,
  content,
  logger,
}: {
  client: OutlookClient;
  draftId: string;
  attachment: Attachment;
  content: Buffer;
  logger: Logger;
}) {
  const uploadSession = await withOutlookRetry(
    () =>
      client
        .getClient()
        .api(`/me/messages/${draftId}/attachments/createUploadSession`)
        .post({
          AttachmentItem: {
            attachmentType: "file",
            name: attachment.filename || "attachment.pdf",
            contentType: attachment.contentType || "application/octet-stream",
            size: content.length,
          },
        }),
    logger,
  );

  const uploadUrl = (uploadSession as { uploadUrl?: string }).uploadUrl;
  if (!uploadUrl) {
    throw new Error("Failed to create Outlook attachment upload session");
  }

  let start = 0;
  while (start < content.length) {
    const end = Math.min(start + GRAPH_UPLOAD_CHUNK_SIZE_BYTES, content.length);
    const chunk = content.subarray(start, end);
    start = await withOutlookRetry(
      () =>
        uploadAttachmentChunk({
          uploadUrl,
          chunk,
          start,
          end,
          totalSize: content.length,
        }),
      logger,
    );
  }
}

async function uploadAttachmentChunk({
  uploadUrl,
  chunk,
  start,
  end,
  totalSize,
}: {
  uploadUrl: string;
  chunk: Buffer;
  start: number;
  end: number;
  totalSize: number;
}): Promise<number> {
  const response = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(chunk.length),
      "Content-Range": `bytes ${start}-${end - 1}/${totalSize}`,
    },
    body: new Uint8Array(chunk),
  });

  if (response.status === 201) {
    return totalSize;
  }

  if (response.status === 200 || response.status === 202) {
    const uploadStatus = (await response.json()) as UploadSessionStatus;
    const nextStart = getNextExpectedRangeStart(
      uploadStatus.nextExpectedRanges,
    );
    if (typeof nextStart !== "number") {
      throw new Error(
        `Outlook upload session returned ${response.status} without nextExpectedRanges`,
      );
    }

    return nextStart;
  }

  if (response.status === 416) {
    const uploadStatus = await getUploadSessionStatus(uploadUrl);
    if (!uploadStatus) {
      return end;
    }

    const nextStart = getNextExpectedRangeStart(
      uploadStatus.nextExpectedRanges,
    );
    if (typeof nextStart === "number" && nextStart > start) {
      return nextStart;
    }

    throw new Error(
      "Outlook upload session returned 416 without a usable resume range",
    );
  }

  return await throwOutlookResponseError(
    response,
    "upload Outlook attachment chunk",
  );
}

interface UploadSessionStatus {
  nextExpectedRanges?: string[];
}

async function getUploadSessionStatus(
  uploadUrl: string,
): Promise<UploadSessionStatus | null> {
  const response = await fetch(uploadUrl, { method: "GET" });

  if (response.status === 404 || response.status === 405) {
    return null;
  }

  if (!response.ok) {
    return await throwOutlookResponseError(
      response,
      "fetch Outlook upload session status",
    );
  }

  return (await response.json()) as UploadSessionStatus;
}

function getNextExpectedRangeStart(nextExpectedRanges?: string[]) {
  const nextRange = nextExpectedRanges?.[0];
  if (!nextRange) return null;

  const [rangeStart] = nextRange.split("-");
  if (!rangeStart) return null;

  const parsedRangeStart = Number.parseInt(rangeStart, 10);
  return Number.isNaN(parsedRangeStart) ? null : parsedRangeStart;
}

async function throwOutlookResponseError(
  response: Response,
  action: string,
): Promise<never> {
  const errorText = await response.text();
  const error = new Error(
    `Failed to ${action}: ${response.status} ${
      errorText || response.statusText
    }`,
  );
  Object.assign(error, {
    status: response.status,
    body: errorText,
    response: { headers: response.headers, status: response.status },
  });
  throw error;
}
