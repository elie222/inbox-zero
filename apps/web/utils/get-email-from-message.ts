import type { ParsedMessage, EmailForLLM } from "@/utils/types";
import { emailToContent, type EmailToContentOptions } from "@/utils/mail";
import { internalDateToDate } from "@/utils/date";

export function getEmailForLLM(
  message: ParsedMessage,
  contentOptions?: EmailToContentOptions,
): EmailForLLM {
  return {
    id: message.id,
    from: message.headers.from,
    to: message.headers.to,
    replyTo: message.headers["reply-to"],
    cc: message.headers.cc,
    subject: message.headers.subject,
    content: emailToContent(message, contentOptions),
    date: internalDateToDate(message.internalDate),
    attachments: message.attachments?.map((attachment) => ({
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
    })),
  };
}
