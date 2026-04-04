import type { ParsedMessage, EmailForLLM } from "@/utils/types";
import { emailToContent, type EmailToContentOptions } from "@/utils/mail";
import { internalDateToDate } from "@/utils/date";
import { sanitizeForAI } from "@/utils/ai/content-sanitizer";

// Convert a ParsedMessage to an EmailForLLM
export function getEmailForLLM(
  message: ParsedMessage,
  contentOptions?: EmailToContentOptions,
): EmailForLLM {
  const { textPlain, textHtml } = sanitizeForAI({
    textPlain: message.textPlain,
    textHtml: message.textHtml,
  });
  const sanitizedMessage = { ...message, textPlain, textHtml };

  return {
    id: message.id,
    from: message.headers.from,
    to: message.headers.to,
    replyTo: message.headers["reply-to"],
    cc: message.headers.cc,
    subject: message.headers.subject,
    content: emailToContent(sanitizedMessage, contentOptions),
    date: internalDateToDate(message.internalDate),
    listUnsubscribe: message.headers["list-unsubscribe"] || undefined,
    attachments: message.attachments?.map((attachment) => ({
      attachmentId: attachment.attachmentId,
      filename: attachment.filename,
      mimeType: attachment.mimeType,
      size: attachment.size,
    })),
  };
}
