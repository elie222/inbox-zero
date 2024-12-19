import type { ParsedMessage } from "@/utils/types";
import { emailToContent } from "@/utils/mail";

export function getEmailFromMessage(message: ParsedMessage) {
  return {
    from: message.headers.from,
    to: message.headers.to,
    subject: message.headers.subject,
    headerMessageId: message.headers["message-id"] || "",
    messageId: message.id,
    snippet: message.snippet,
    textHtml: message.textHtml || null,
    textPlain: message.textPlain || null,
    threadId: message.threadId,
    cc: message.headers.cc || undefined,
    date: message.headers.date,
    references: message.headers.references,
    replyTo: message.headers["reply-to"],
    content: emailToContent({
      textHtml: message.textHtml || null,
      textPlain: message.textPlain || null,
      snippet: message.snippet || null,
    }),
  };
}
