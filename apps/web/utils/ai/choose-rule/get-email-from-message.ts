import type { ParsedMessage, EmailForLLM } from "@/utils/types";
import { emailToContent, type EmailToContentOptions } from "@/utils/mail";

export function getEmailForLLM(
  message: ParsedMessage,
  contentOptions?: EmailToContentOptions,
): EmailForLLM {
  return {
    from: message.headers.from,
    replyTo: message.headers["reply-to"],
    cc: message.headers.cc,
    subject: message.headers.subject,
    content: emailToContent(message, contentOptions),
  };
}
