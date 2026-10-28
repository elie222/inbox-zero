import { convert } from "html-to-text";
import type { ParsedMessage } from "@/utils/types";

export function toLocalMailMessage(message: ParsedMessage): ParsedMessage {
  return {
    id: message.id,
    threadId: message.threadId,
    historyId: message.historyId,
    internalDate: message.internalDate,
    date: message.date,
    subject: message.subject,
    snippet: message.snippet,
    labelIds: message.labelIds,
    parentFolderId: message.parentFolderId,
    conversationIndex: message.conversationIndex,
    externalUrl: message.externalUrl,
    isMeetingInvitation: message.isMeetingInvitation,
    bodyContentType: message.bodyContentType,
    textHtml: message.textHtml,
    textPlain:
      message.textPlain ??
      (message.textHtml !== undefined
        ? convert(message.textHtml, {
            wordwrap: false,
            selectors: [
              { selector: "img", format: "skip" },
              { selector: "a", options: { ignoreHref: true } },
            ],
          })
        : undefined),
    headers: {
      from: message.headers.from,
      to: message.headers.to,
      cc: message.headers.cc,
      bcc: message.headers.bcc,
      subject: message.headers.subject,
      date: message.headers.date,
      "message-id": message.headers["message-id"],
      "in-reply-to": message.headers["in-reply-to"],
      "reply-to": message.headers["reply-to"],
      references: message.headers.references,
      "list-unsubscribe": message.headers["list-unsubscribe"],
      "list-unsubscribe-post": message.headers["list-unsubscribe-post"],
    },
    attachments: message.attachments?.map(attachmentMetadata),
    inline: message.inline.map(attachmentMetadata),
  };
}

function attachmentMetadata(
  attachment: NonNullable<ParsedMessage["attachments"]>[number],
) {
  return {
    attachmentId: attachment.attachmentId,
    filename: attachment.filename,
    mimeType: attachment.mimeType,
    size: attachment.size,
    headers: {
      "content-description": attachment.headers["content-description"],
      "content-disposition": attachment.headers["content-disposition"],
      "content-id": attachment.headers["content-id"],
      "content-transfer-encoding":
        attachment.headers["content-transfer-encoding"],
      "content-type": attachment.headers["content-type"],
    },
  };
}
