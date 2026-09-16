import type {
  Attachment,
  ParsedMessage,
  ParsedMessageHeaders,
} from "@/utils/types";

export function sanitizeCachedMailMessage(
  message: ParsedMessage,
): ParsedMessage {
  return {
    attachments: message.attachments?.map(sanitizeAttachment),
    bodyContentType: message.bodyContentType,
    conversationIndex: message.conversationIndex,
    date: message.date,
    externalUrl: message.externalUrl,
    headers: sanitizeHeaders(message.headers),
    historyId: message.historyId,
    id: message.id,
    inline: message.inline.map(sanitizeInlineAttachment),
    internalDate: message.internalDate,
    labelIds: message.labelIds ? [...message.labelIds] : undefined,
    parentFolderId: message.parentFolderId,
    rawRecipients: message.rawRecipients,
    snippet: message.snippet,
    subject: message.subject,
    textHtml: message.textHtml,
    textPlain: message.textPlain,
    threadId: message.threadId,
  };
}

function sanitizeAttachment(attachment: Attachment): Attachment {
  return {
    attachmentId: attachment.attachmentId,
    filename: attachment.filename,
    headers: {
      "content-description": attachment.headers["content-description"],
      "content-disposition": attachment.headers["content-disposition"],
      "content-id": attachment.headers["content-id"],
      "content-transfer-encoding":
        attachment.headers["content-transfer-encoding"],
      "content-type": attachment.headers["content-type"],
    },
    mimeType: attachment.mimeType,
    size: attachment.size,
  };
}

function sanitizeInlineAttachment(
  attachment: ParsedMessage["inline"][number],
): ParsedMessage["inline"][number] {
  return {
    attachmentId: attachment.attachmentId,
    filename: attachment.filename,
    headers: {
      "content-description": attachment.headers["content-description"],
      "content-id": attachment.headers["content-id"],
      "content-transfer-encoding":
        attachment.headers["content-transfer-encoding"],
      "content-type": attachment.headers["content-type"],
    },
    mimeType: attachment.mimeType,
    size: attachment.size,
  };
}

function sanitizeHeaders(headers: ParsedMessageHeaders): ParsedMessageHeaders {
  return {
    bcc: headers.bcc,
    cc: headers.cc,
    date: headers.date,
    from: headers.from,
    "in-reply-to": headers["in-reply-to"],
    "list-unsubscribe": headers["list-unsubscribe"],
    "list-unsubscribe-post": headers["list-unsubscribe-post"],
    "message-id": headers["message-id"],
    references: headers.references,
    "reply-to": headers["reply-to"],
    subject: headers.subject,
    to: headers.to,
  };
}
